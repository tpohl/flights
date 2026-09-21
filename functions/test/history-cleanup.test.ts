import { strict as assert } from "node:assert";
import { buildCleanupArtifact, stableJson } from "../src/history-cleanup";
import { parseArguments, run } from "../src/history-cleanup/cli";
import { resolveLocalIso } from "../src/history-cleanup/timezone";

const airports = {
  FRA: { code: "FRA", timezoneId: "Europe/Berlin", latitude: 50.033333, longitude: 8.570556 },
  JFK: { code: "JFK", timezoneId: "America/New_York", latitude: 40.639751, longitude: -73.778925 },
  DEL: { code: "DEL", timezoneId: "Asia/Kolkata", latitude: 28.5562, longitude: 77.1 },
  SYD: { code: "SYD", timezoneId: "Australia/Sydney", latitude: -33.9461, longitude: 151.1772 },
  LAX: { code: "LAX", timezoneId: "America/Los_Angeles", latitude: 33.9425, longitude: -118.408 },
};

const artifact = (
  flights: Record<string, unknown>,
  airportData: unknown = airports
) => buildCleanupArtifact({
  flightsSource: { path: "/private/flights.json", content: JSON.stringify({ flights, aeroApiTracks: {} }) },
  airportsSource: { path: "/private/airports.json", content: JSON.stringify(airportData) },
  generatedAt: "2026-09-11T00:00:00.000Z",
});

const baseFlight = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-01-15",
  flightno: "LH400",
  from: "FRA",
  to: "JFK",
  ...overrides,
});

const change = (result: ReturnType<typeof artifact>, key: string, field: string) =>
  result.proposedChanges.find((proposal) => proposal.firebaseKey === key)
    ?.changes.find((candidate) => candidate.field === field);

describe("History cleanup timezone resolution", () => {
  it("resolves normal local time and a fractional-offset zone", () => {
    assert.deepEqual(resolveLocalIso("2026-01-15T10:00", "Europe/Berlin"), {
      state: "resolved", value: "2026-01-15T09:00:00.000Z", offset: "UTC+01:00",
    });
    assert.deepEqual(resolveLocalIso("2026-01-15T10:00:30.25", "Asia/Kolkata"), {
      state: "resolved", value: "2026-01-15T04:30:30.250Z", offset: "UTC+05:30",
    });
  });

  it("does not guess through DST gaps or overlaps", () => {
    assert.equal(resolveLocalIso("2026-03-29T02:30", "Europe/Berlin").state, "gap");
    const overlap = resolveLocalIso("2026-10-25T02:30", "Europe/Berlin");
    assert.equal(overlap.state, "overlap");
    if (overlap.state === "overlap") assert.equal(overlap.options.length, 2);
  });

  it("reports invalid IANA timezones", () => {
    const result = resolveLocalIso("2026-01-15T10:00", "Mars/Olympus");
    assert.equal(result.state, "invalid");
  });

  it("handles overnight and date-line crossings using airport-local dates", () => {
    const result = artifact({
      crossing: baseFlight({
        from: "SYD",
        to: "LAX",
        departureTime: "2026-01-15T12:00",
        arrivalTime: "2026-01-15T08:00",
      }),
    });
    assert.equal(change(result, "crossing", "departureTime")?.after, "2026-01-15T01:00:00.000Z");
    assert.equal(change(result, "crossing", "arrivalTime")?.after, "2026-01-15T16:00:00.000Z");
    assert.equal(change(result, "crossing", "durationMilliseconds")?.after, 15 * 60 * 60 * 1000);
  });
});

describe("History cleanup proposals", () => {
  it("converts unambiguous local times, recomputes duration, and derives distance", () => {
    const result = artifact({
      first: baseFlight({
        departureTime: "2026-01-15T10:00",
        arrivalTime: "2026-01-15T14:00",
      }),
    });
    assert.equal(change(result, "first", "departureTime")?.after, "2026-01-15T09:00:00.000Z");
    assert.equal(change(result, "first", "arrivalTime")?.after, "2026-01-15T19:00:00.000Z");
    assert.equal(change(result, "first", "durationMilliseconds")?.after, 36000000);
    assert.ok(Number(change(result, "first", "distance")?.after) > 6100);
  });

  it("fills a missing duration but never alters timezone-bearing timestamps or populated fields", () => {
    const result = artifact({
      first: baseFlight({
        departureTime: "2026-01-15T09:00:00Z",
        arrivalTime: "2026-01-15T11:00:00+00:00",
        distance: 1,
        aircraftTypeCode: "USER",
      }),
    });
    assert.equal(change(result, "first", "durationMilliseconds")?.after, 7200000);
    assert.equal(change(result, "first", "departureTime"), undefined);
    assert.equal(change(result, "first", "arrivalTime"), undefined);
    assert.equal(change(result, "first", "distance"), undefined);
    assert.equal(change(result, "first", "aircraftTypeCode"), undefined);
  });

  it("preserves populated invalid distances for manual review", () => {
    const result = artifact({
      first: baseFlight({
        distance: 0,
        plannedDistance: -1,
        flownDistance: "invalid",
        aeroApiFlight: {
          fa_flight_id: "fa-1",
          ident_iata: "LH400",
          origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
          destination: { code_iata: "JFK", timezone: "America/New_York" },
          scheduled_out: "2026-01-15T08:00:00Z",
          route_distance: 100,
        },
      }),
    });
    for (const field of ["distance", "plannedDistance", "flownDistance"]) {
      assert.equal(change(result, "first", field), undefined);
      assert.ok(result.reviewOnlyFindings.some((finding) =>
        finding.category === "invalid-stored-distance" && finding.fields?.includes(field)));
    }
  });

  it("only fills missing duration after local-time correction", () => {
    const result = artifact({
      equal: baseFlight({
        departureTime: "2026-01-15T10:00",
        arrivalTime: "2026-01-15T14:00",
        durationMilliseconds: 10 * 60 * 60 * 1000,
      }),
      conflicting: baseFlight({
        flightno: "LH401",
        departureTime: "2026-01-15T10:00",
        arrivalTime: "2026-01-15T14:00",
        durationMilliseconds: 2 * 60 * 60 * 1000,
      }),
      missing: baseFlight({
        flightno: "LH402",
        departureTime: "2026-01-15T10:00",
        arrivalTime: "2026-01-15T14:00",
      }),
    });
    assert.equal(change(result, "equal", "durationMilliseconds"), undefined);
    assert.equal(result.reviewOnlyFindings.some((finding) =>
      finding.firebaseKey === "equal" && finding.category === "duration-conflict"), false);
    assert.equal(change(result, "conflicting", "durationMilliseconds"), undefined);
    const conflict = result.reviewOnlyFindings.find((finding) =>
      finding.firebaseKey === "conflicting" && finding.category === "duration-conflict");
    assert.deepEqual(conflict?.evidence, {
      storedDurationMilliseconds: 7200000,
      correctedDurationMilliseconds: 36000000,
      differenceMilliseconds: 28800000,
    });
    assert.equal(change(result, "missing", "durationMilliseconds")?.after, 36000000);
  });

  it("uses trusted cached AeroAPI evidence and its track without overwriting user values", () => {
    const flight = baseFlight({
      from: "",
      to: "",
      carrier: "My carrier",
      departureTime: "",
      aeroApiFlight: {
        fa_flight_id: "fa-1",
        ident_iata: "LH400",
        origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
        destination: { code_iata: "JFK", timezone: "America/New_York" },
        scheduled_out: "2026-01-15T08:00:00Z",
        estimated_out: "2026-01-15T08:10:00Z",
        actual_out: "2026-01-15T08:15:00Z",
        scheduled_off: "2026-01-15T08:20:00Z",
        actual_in: "2026-01-15T16:00:00Z",
        aircraft_type: "b789",
        registration: "D-TEST",
        operator_name: "Provider carrier",
        route_distance: 100,
      },
    });
    const result = buildCleanupArtifact({
      flightsSource: {
        path: "flights.json",
        content: JSON.stringify({ flights: { first: flight }, aeroApiTracks: { "fa-1": { actual_distance: 90 } } }),
      },
      airportsSource: { path: "airports.json", content: JSON.stringify(airports) },
      generatedAt: "2026-09-11T00:00:00.000Z",
    });
    assert.equal(change(result, "first", "from")?.after, "FRA");
    assert.equal(change(result, "first", "departureTime")?.after, "2026-01-15T08:15:00Z");
    assert.equal(change(result, "first", "departureTimeSource")?.after, "actual");
    assert.equal(change(result, "first", "scheduledTakeoffTime")?.after, "2026-01-15T08:20:00Z");
    assert.equal(change(result, "first", "aircraftTypeCode")?.after, "B789");
    assert.equal(change(result, "first", "flightAwareFlightId")?.after, "fa-1");
    assert.equal(change(result, "first", "plannedDistance")?.after, 160.9344);
    assert.equal(change(result, "first", "flownDistance")?.after, 144.84096);
    assert.equal(change(result, "first", "aeroApiEnrichment"), undefined);
    assert.equal(change(result, "first", "carrier"), undefined);
  });

  it("trusts the scheduled departure date when an actual departure crosses local midnight", () => {
    const result = artifact({
      delayed: baseFlight({
        aeroApiFlight: {
          fa_flight_id: "fa-delayed",
          ident_iata: "LH400",
          origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
          destination: { code_iata: "JFK", timezone: "America/New_York" },
          scheduled_out: "2026-01-15T22:00:00Z",
          actual_out: "2026-01-15T23:30:00Z",
          aircraft_type: "B789",
        },
      }),
    });
    assert.equal(change(result, "delayed", "aircraftTypeCode")?.after, "B789");
    assert.equal(result.reviewOnlyFindings.some((finding) =>
      finding.category === "untrusted-aeroapi-evidence"), false);
  });

  it("only assigns a provider time source when the canonical instant matches", () => {
    const result = artifact({
      mismatch: baseFlight({
        departureTime: "2026-01-15T09:00:00Z",
        aeroApiFlight: {
          fa_flight_id: "fa-mismatch",
          ident_iata: "LH400",
          origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
          destination: { code_iata: "JFK", timezone: "America/New_York" },
          scheduled_out: "2026-01-15T08:00:00Z",
          actual_out: "2026-01-15T08:15:00Z",
        },
      }),
      exact: baseFlight({
        flightno: "LH401",
        departureTime: "2026-01-15T08:15:00Z",
        aeroApiFlight: {
          fa_flight_id: "fa-exact",
          ident_iata: "LH401",
          origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
          destination: { code_iata: "JFK", timezone: "America/New_York" },
          scheduled_out: "2026-01-15T08:00:00Z",
          actual_out: "2026-01-15T08:15:00Z",
        },
      }),
      normalized: baseFlight({
        flightno: "LH402",
        departureTime: "2026-01-15T09:15",
        aeroApiFlight: {
          fa_flight_id: "fa-normalized",
          ident_iata: "LH402",
          origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
          destination: { code_iata: "JFK", timezone: "America/New_York" },
          scheduled_out: "2026-01-15T08:00:00Z",
          actual_out: "2026-01-15T08:15:00Z",
        },
      }),
    });
    assert.equal(change(result, "mismatch", "departureTimeSource"), undefined);
    assert.equal(change(result, "exact", "departureTimeSource")?.after, "actual");
    assert.equal(change(result, "normalized", "departureTime")?.after, "2026-01-15T08:15:00.000Z");
    assert.equal(change(result, "normalized", "departureTimeSource")?.after, "actual");
  });

  it("treats zero cached actual distance as unavailable rather than invalid", () => {
    const flight = baseFlight({
      aeroApiFlight: {
        fa_flight_id: "fa-zero",
        ident_iata: "LH400",
        origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
        destination: { code_iata: "JFK", timezone: "America/New_York" },
        scheduled_out: "2026-01-15T08:00:00Z",
      },
    });
    const result = buildCleanupArtifact({
      flightsSource: {
        path: "flights.json",
        content: JSON.stringify({
          flights: { zero: flight },
          aeroApiTracks: { "fa-zero": { actual_distance: 0 } },
        }),
      },
      airportsSource: { path: "airports.json", content: JSON.stringify(airports) },
      generatedAt: "2026-09-11T00:00:00.000Z",
    });
    assert.equal(change(result, "zero", "flownDistance"), undefined);
    assert.equal(result.reviewOnlyFindings.some((finding) =>
      finding.category === "invalid-track-distance"), false);
  });

  it("makes mismatched cached AeroAPI evidence review-only", () => {
    const result = artifact({
      first: baseFlight({
        aeroApiFlight: {
          fa_flight_id: "fa-1",
          ident_iata: "LH401",
          origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
          scheduled_out: "2026-01-15T08:00:00Z",
          aircraft_type: "B789",
        },
      }),
    });
    assert.equal(change(result, "first", "aircraftTypeCode"), undefined);
    assert.ok(result.reviewOnlyFindings.some((finding) => finding.category === "untrusted-aeroapi-evidence"));
  });

  for (const [name, overrides] of [
    ["provider ID", { flightAwareFlightId: "stored-fa", candidate: { fa_flight_id: "other-fa" } }],
    ["origin", {
      from: "FRA",
      candidate: { origin: { code_iata: "MUC", timezone: "Europe/Berlin" } },
    }],
    ["destination", {
      to: "JFK",
      candidate: { destination: { code_iata: "LAX", timezone: "America/Los_Angeles" } },
    }],
  ] as const) {
    it(`rejects cached AeroAPI evidence with a conflicting ${name}`, () => {
      const result = artifact({
        first: baseFlight({
          flightAwareFlightId: "fa-1",
          ...("flightAwareFlightId" in overrides ?
            { flightAwareFlightId: overrides.flightAwareFlightId } : {}),
          aeroApiFlight: {
            fa_flight_id: "fa-1",
            ident_iata: "LH400",
            origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
            destination: { code_iata: "JFK", timezone: "America/New_York" },
            scheduled_out: "2026-01-15T08:00:00Z",
            aircraft_type: "B789",
            ...overrides.candidate,
          },
        }),
      });
      assert.equal(change(result, "first", "aircraftTypeCode"), undefined);
      assert.ok(result.reviewOnlyFindings.some((finding) =>
        finding.firebaseKey === "first" &&
        finding.category === "untrusted-aeroapi-evidence"));
    });
  }

  it("accepts normalized matching provider ID and populated route values", () => {
    const result = artifact({
      first: baseFlight({
        from: "fra",
        to: "jfk",
        flightAwareFlightId: "fa-1",
        aeroApiFlight: {
          fa_flight_id: "fa-1",
          ident_iata: "LH400",
          origin: { code: "FRA", timezone: "Europe/Berlin" },
          destination: { code_iata: "JFK", timezone: "America/New_York" },
          scheduled_out: "2026-01-15T08:00:00Z",
          aircraft_type: "B789",
        },
      }),
    });
    assert.equal(change(result, "first", "aircraftTypeCode")?.after, "B789");
    assert.equal(result.reviewOnlyFindings.some((finding) =>
      finding.category === "untrusted-aeroapi-evidence"), false);
  });

  it("infers aircraft code and display name only from unique two-flight consensus", () => {
    const result = artifact({
      support1: baseFlight({ aircraftType: "Boeing 737-800", aircraftTypeCode: "b738" }),
      support2: baseFlight({ flightno: "LH401", aircraftType: "Boeing 737-800", aircraftTypeCode: "B738" }),
      missingCode: baseFlight({ flightno: "LH402", aircraftType: "Boeing 737-800" }),
      missingName: baseFlight({ flightno: "LH403", aircraftTypeCode: "b738" }),
    });
    assert.equal(change(result, "missingCode", "aircraftTypeCode")?.after, "B738");
    assert.equal(change(result, "missingName", "aircraftType")?.after, "Boeing 737-800");
  });

  it("requires name and registration inference to agree", () => {
    const result = artifact({
      name1: baseFlight({ flightno: "LH401", aircraftType: "Type One", aircraftTypeCode: "A111" }),
      name2: baseFlight({ flightno: "LH402", aircraftType: "Type One", aircraftTypeCode: "A111" }),
      reg1: baseFlight({ flightno: "LH403", aircraftRegistration: "D-TEST", aircraftType: "Other", aircraftTypeCode: "B222" }),
      reg2: baseFlight({ flightno: "LH404", aircraftRegistration: "D-TEST", aircraftType: "Other", aircraftTypeCode: "B222" }),
      target: baseFlight({ flightno: "LH405", aircraftType: "Type One", aircraftRegistration: "D-TEST" }),
    });
    assert.equal(change(result, "target", "aircraftTypeCode"), undefined);
    assert.ok(result.reviewOnlyFindings.some((finding) =>
      finding.firebaseKey === "target" && finding.category === "aircraft-inference-conflict"));
  });

  it("excludes deleted flights and flags likely duplicates", () => {
    const result = artifact({
      a: baseFlight(),
      b: baseFlight(),
      deleted: baseFlight({ _deleted: true, departureTime: "2026-01-15T10:00" }),
    });
    assert.equal(result.summary.activeFlights, 2);
    assert.equal(result.summary.deletedFlights, 1);
    assert.equal(result.proposedChanges.some((proposal) => proposal.firebaseKey === "deleted"), false);
    assert.equal(result.reviewOnlyFindings.filter((finding) => finding.category === "duplicate-likely-flight").length, 2);
  });

  it("builds exact reversible maps with null for absent old values and stable ordering", () => {
    const result = artifact({
      z: baseFlight({ departureTime: "2026-01-15T09:00:00Z", arrivalTime: "2026-01-15T10:00:00Z" }),
      a: baseFlight({ departureTime: "2026-01-15T09:00:00Z", arrivalTime: "2026-01-15T11:00:00Z" }),
    });
    assert.deepEqual(Object.keys(result.forwardUpdates), [...Object.keys(result.forwardUpdates)].sort());
    assert.deepEqual(Object.keys(result.forwardUpdates), Object.keys(result.rollbackUpdates));
    for (const proposal of result.proposedChanges) {
      for (const proposed of proposal.changes) {
        const path = `/flights/${proposal.firebaseKey}/${proposed.field}`;
        assert.deepEqual(result.forwardUpdates[path], proposed.after);
        assert.deepEqual(result.rollbackUpdates[path], proposed.before);
      }
    }
    assert.equal(result.rollbackUpdates["/flights/a/durationMilliseconds"], null);
    assert.equal(stableJson(result), stableJson(result));
  });
});

describe("History cleanup validation and CLI", () => {
  it("rejects malformed and structurally ambiguous exports", () => {
    assert.throws(() => buildCleanupArtifact({
      flightsSource: { path: "f", content: "{" },
      airportsSource: { path: "a", content: "{}" },
    }), /Could not parse flights export JSON/);
    assert.throws(() => buildCleanupArtifact({
      flightsSource: { path: "f", content: "{}" },
      airportsSource: { path: "a", content: "{}" },
    }), /missing.*flights/);
    assert.throws(() => artifact({ a: null }), /must be an object/);
    assert.throws(() => artifact({}, { FRA: null }), /Airport.*must be an object/);
    assert.throws(() => artifact({
      a: baseFlight({ _id: "duplicate" }),
      b: baseFlight({ _id: "duplicate" }),
    }), /Duplicate flight _id/);
  });

  it("warns when a legacy _id differs from the Firebase map key", () => {
    const result = artifact({ key: baseFlight({ _id: "legacy-id" }) });
    assert.ok(result.integrityWarnings.some((warning) => warning.category === "id-key-mismatch"));
    assert.equal(result.summary.legacyIdsDifferentFromFirebaseKeys, 0);
  });

  it("aggregates expected Mongo-shaped legacy IDs without per-record warnings", () => {
    const result = artifact({
      first: baseFlight({ _id: "507f1f77bcf86cd799439011" }),
      second: baseFlight({ flightno: "LH401", _id: "507f191e810c19729de860ea" }),
    });
    assert.equal(result.summary.legacyIdsDifferentFromFirebaseKeys, 2);
    assert.equal(result.integrityWarnings.some((warning) =>
      warning.category === "id-key-mismatch"), false);
  });

  it("rejects Firebase-unsafe keys", () => {
    assert.throws(() => artifact({ "bad/key": baseFlight() }), /Firebase-unsafe/);
  });

  it("requires explicit arguments and rejects input/output collisions before reading", async () => {
    assert.throws(() => parseArguments(["--flights", "a"]), /Usage/);
    await assert.rejects(
      run(["--flights", "same.json", "--airports", "airports.json", "--output", "same.json"]),
      /must not equal/
    );
  });
});
