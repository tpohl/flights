import { strict as assert } from "node:assert";
import * as sinon from "sinon";
import proxyquire from "proxyquire";
import {
  buildFlightSearchWindow,
  FlightDateOutsideAeroApiWindowError,
  matchAeroApiFlight,
  normalizeFlightNumber
} from "../src/autocomplete/aero-api/matcher";
import { applyAeroApiFlight, isFinalAeroApiResult } from "../src/autocomplete/aero-api/transformer";
import {
  AeroApiBudgetExceededError,
  loadAccountSpend,
  reserveAeroApiBudget,
  resetAeroApiUsageCacheForTests
} from "../src/autocomplete/aero-api/budget";
import {
  acquireEnrichmentLock,
  makeRefreshJob,
  nextRefreshAt,
  releaseEnrichmentLock,
  retryRefreshJobAfterFailure
} from "../src/autocomplete/aero-api/lifecycle";
import { logger } from "./helpers";

const now = new Date("2026-09-11T12:00:00Z");
const candidate = (overrides: any = {}) => ({
  fa_flight_id: "fa-1",
  ident_iata: "LH400",
  codeshares_iata: [],
  origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
  destination: { code_iata: "JFK", timezone: "America/New_York" },
  scheduled_out: "2026-09-10T22:30:00Z",
  scheduled_in: "2026-09-11T06:30:00Z",
  ...overrides
});

describe("AeroAPI matching", () => {
  it("normalizes common IATA designators including digit-leading carriers", () => {
    assert.equal(normalizeFlightNumber(" lh-400 "), "LH400");
    assert.equal(normalizeFlightNumber("4u 9525"), "4U9525");
    assert.equal(normalizeFlightNumber("B6 123"), "B6123");
    assert.equal(normalizeFlightNumber("W6-400"), "W6400");
    assert.equal(normalizeFlightNumber("U2 99A"), "U299A");
  });

  for (const invalid of ["", "L4", "LHH400", "LH", "LH40000", "LH_400"]) {
    it(`rejects invalid designator ${JSON.stringify(invalid)}`, () => {
      assert.throws(() => normalizeFlightNumber(invalid), /valid IATA flight number/);
    });
  }

  it("builds a broad, encoded-compatible UTC window and clamps it to provider support", () => {
    assert.deepEqual(buildFlightSearchWindow("2026-09-10", now), {
      start: "2026-09-09T00:00:00.000Z",
      end: "2026-09-12T00:00:00.000Z"
    });
    assert.equal(buildFlightSearchWindow("2026-09-01", now).start, "2026-09-01T12:00:00.000Z");
    assert.equal(buildFlightSearchWindow("2026-09-13", now).end, "2026-09-13T12:00:00.000Z");
    assert.throws(
      () => buildFlightSearchWindow("2026-08-31", now),
      FlightDateOutsideAeroApiWindowError
    );
  });

  it("matches the origin-local date across a UTC boundary", () => {
    const result = matchAeroApiFlight("LH400", "2026-09-11", [candidate()]);
    assert.equal(result.state, "matched");
  });

  it("matches direct and codeshare identifier fallbacks", () => {
    assert.equal(matchAeroApiFlight("LH400", "2026-09-11", [
      candidate({ ident_iata: undefined, ident: "LH400" })
    ]).state, "matched");
    const result = matchAeroApiFlight("UA8845", "2026-09-11", [
      candidate({ ident_iata: "LH400", codeshares: ["UA8845"] })
    ]);
    assert.equal(result.state, "matched");
  });

  it("filters another day, cancelled, position-only, malformed time and timezone", () => {
    const flights = [
      candidate({ fa_flight_id: "day", scheduled_out: "2026-09-09T10:00:00Z" }),
      candidate({ fa_flight_id: "cancelled", cancelled: true }),
      candidate({ fa_flight_id: "position", position_only: true }),
      candidate({ fa_flight_id: "time", scheduled_out: "bad" }),
      candidate({ fa_flight_id: "zone", origin: { code_iata: "FRA", timezone: "bad" } })
    ];
    assert.deepEqual(matchAeroApiFlight("LH400", "2026-09-11", flights), {
      state: "not_found", candidateCount: 0
    });
  });

  it("uses an existing exact route to disambiguate multi-leg results", () => {
    const result = matchAeroApiFlight("LH400", "2026-09-11", [
      candidate(), candidate({
        fa_flight_id: "fa-2",
        origin: { code_iata: "MUC", timezone: "Europe/Berlin" }
      })
    ], { from: "MUC", to: "JFK" });
    assert.equal(result.state, "matched");
    if (result.state === "matched") assert.equal(result.flight.fa_flight_id, "fa-2");
  });

  it("uses either supplied route component to disambiguate", () => {
    const flights = [
      candidate(),
      candidate({
        fa_flight_id: "fa-2",
        origin: { code_iata: "MUC", timezone: "Europe/Berlin" },
        destination: { code_iata: "EWR", timezone: "America/New_York" },
      }),
    ];
    const byOrigin = matchAeroApiFlight("LH400", "2026-09-11", flights, { from: "MUC" });
    const byDestination = matchAeroApiFlight("LH400", "2026-09-11", flights, { to: "EWR" });
    assert.equal(byOrigin.state, "matched");
    assert.equal(byDestination.state, "matched");
    if (byOrigin.state === "matched") assert.equal(byOrigin.flight.fa_flight_id, "fa-2");
    if (byDestination.state === "matched") assert.equal(byDestination.flight.fa_flight_id, "fa-2");
  });

  it("rejects a sole candidate that contradicts an entered route", () => {
    assert.deepEqual(
      matchAeroApiFlight("LH400", "2026-09-11", [candidate()], { from: "MUC" }),
      { state: "not_found", candidateCount: 0 }
    );
  });

  it("returns ambiguity instead of silently selecting the first candidate", () => {
    const flights = Array.from({ length: 16 }, (_, index) =>
      candidate({ fa_flight_id: `fa-${index}` }));
    const result = matchAeroApiFlight("LH400", "2026-09-11", flights);
    assert.equal(result.state, "ambiguous");
    if (result.state === "ambiguous") {
      assert.equal(result.candidateCount, 16);
      assert.equal(result.summaries.length, 15);
    }
  });
});

describe("AeroAPI transformation", () => {
  const enrichment: any = { state: "partial", lastAttemptAt: now.toISOString() };

  it("maps gate, runway, aircraft, carrier and statute-mile distances", () => {
    const result = applyAeroApiFlight({ flightno: "LH400", manualOverrides: {} } as any, candidate({
      actual_out: "2026-09-10T22:40:00Z",
      estimated_in: "2026-09-11T06:40:00Z",
      scheduled_off: "2026-09-10T22:50:00Z",
      actual_on: "2026-09-11T06:20:00Z",
      route_distance: 100,
      aircraft_type: "B744",
      registration: "D-ABCD",
      operator: "Lufthansa"
    }), { actual_distance: 90, positions: [] }, enrichment);
    assert.equal(result.departureTime, "2026-09-10T22:40:00Z");
    assert.equal(result.arrivalTime, "2026-09-11T06:40:00Z");
    assert.equal(result.departureTimeSource, "actual");
    assert.equal(result.arrivalTimeSource, "estimated");
    assert.equal(result.scheduledTakeoffTime, "2026-09-10T22:50:00Z");
    assert.equal(result.actualLandingTime, "2026-09-11T06:20:00Z");
    assert.equal(result.plannedDistance, 160.9344);
    assert.equal(result.flownDistance, 144.84096);
    assert.equal(result.aircraftTypeCode, "B744");
    assert.equal(result.aircraftType, null);
    assert.equal(result.carrier, "Lufthansa");
  });

  it("honors canonical manual time overrides", () => {
    const result = applyAeroApiFlight({
      departureTime: "manual", arrivalTime: "manual-arrival",
      manualOverrides: { departureTime: true, arrivalTime: true }
    } as any, candidate({ actual_out: "actual", actual_in: "actual-in" }), null, enrichment);
    assert.equal(result.departureTime, "manual");
    assert.equal(result.arrivalTime, "manual-arrival");
    assert.equal(result.departureTimeSource, "manual");
    assert.equal(result.arrivalTimeSource, "manual");
  });

  it("defines final as actual gate times plus positive actual track distance", () => {
    const flight = candidate({ actual_out: "2026-09-10T22:40:00Z", actual_in: "2026-09-11T06:40:00Z" });
    assert.equal(isFinalAeroApiResult(flight, { actual_distance: 1, positions: [] }), true);
    assert.equal(isFinalAeroApiResult(flight, { actual_distance: 0, positions: [] }), false);
    assert.equal(isFinalAeroApiResult(candidate(), { actual_distance: 1, positions: [] }), false);
  });
});

describe("AeroAPI budget", () => {
  let ledger: any;
  let ref: any;

  beforeEach(() => {
    resetAeroApiUsageCacheForTests();
    ledger = null;
    const monthRef = {
      transaction: sinon.stub().callsFake(async (update) => {
        const next = update(structuredClone(ledger));
        if (next !== undefined) ledger = next;
        return { committed: next !== undefined };
      })
    };
    ref = { child: sinon.stub().returns(monthRef) };
  });

  it("uses maximum raw/discounted monthly spend and omits a future end", async () => {
    const fetchStub = sinon.stub().resolves({
      ok: true, json: async () => ({ total_discount_cost: 1.25, total_cost: 2 })
    });
    assert.equal(await loadAccountSpend("key", fetchStub, now), 2);
    assert.equal(await loadAccountSpend("key", fetchStub, new Date(now.valueOf() + 60_000)), 2);
    assert.equal(fetchStub.callCount, 1);
    const url = new URL(fetchStub.firstCall.args[0]);
    assert.equal(url.searchParams.get("all_keys"), "true");
    assert.equal(url.searchParams.get("start"), "2026-09-01T00:00:00.000Z");
    assert.equal(url.searchParams.has("end"), false);
  });

  it("uses the valid cost when the other account total is invalid", async () => {
    const fetchStub = sinon.stub().resolves({
      ok: true, json: async () => ({ total_discount_cost: null, total_cost: 1.5 })
    });
    assert.equal(await loadAccountSpend("key", fetchStub, now), 1.5);
    resetAeroApiUsageCacheForTests();
    fetchStub.resolves({
      ok: true, json: async () => ({ total_discount_cost: null, total_cost: null })
    });
    await assert.rejects(loadAccountSpend("key", fetchStub, now), /invalid account usage/);
  });

  it("fails closed when usage cannot be loaded", async () => {
    await assert.rejects(loadAccountSpend("key", sinon.stub().rejects(new Error("offline")), now),
      /verify AeroAPI account usage/);
  });

  it("enforces $4.50 including conservative recent reservations", async () => {
    await reserveAeroApiBudget(ref, "flights", 0.005, 4.49, now);
    await assert.rejects(
      reserveAeroApiBudget(ref, "track", 0.012, 4.49, now),
      AeroApiBudgetExceededError
    );
  });

  it("serializes concurrent reservations so they cannot cross the limit", async () => {
    const results = await Promise.allSettled([
      reserveAeroApiBudget(ref, "track", 0.012, 4.48, now),
      reserveAeroApiBudget(ref, "track", 0.012, 4.48, now)
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  });

  it("uses the final committed transaction result after callback retries", async () => {
    let ledger: any = null;
    const monthRef = {
      transaction: sinon.stub().callsFake(async (update) => {
        update({ reservations: { high: { endpoint: "track", cost: 1, timestamp: now.valueOf() } } });
        ledger = update({ reservations: {} });
        return { committed: true };
      })
    };
    await reserveAeroApiBudget({ child: () => monthRef } as any, "flights", 0.005, 4, now);
    assert.equal(Object.keys(ledger.reservations).length, 1);
  });

  it("rejects instead of dropping active reservations at the storage cap", async () => {
    ledger = {
      reservations: Object.fromEntries(Array.from({ length: 200 }, (_, index) => [
        `active-${index}`,
        { endpoint: "free-test", cost: 0, timestamp: now.valueOf() },
      ])),
    };
    await assert.rejects(
      reserveAeroApiBudget(ref, "flights", 0.005, 0, now),
      AeroApiBudgetExceededError
    );
    assert.equal(Object.keys(ledger.reservations).length, 200);
  });

  it("rejects whenever the final transaction result is not committed", async () => {
    const monthRef = {
      transaction: sinon.stub().callsFake(async (update) => {
        update({ reservations: {} });
        return { committed: false };
      })
    };
    await assert.rejects(
      reserveAeroApiBudget({ child: () => monthRef } as any, "flights", 0.005, 0, now),
      AeroApiBudgetExceededError
    );
  });

  it("ignores reservations older than the provider lag buffer", async () => {
    ledger = { reservations: { old: { endpoint: "track", cost: 1, timestamp: now.valueOf() - 16 * 60_000 } } };
    await reserveAeroApiBudget(ref, "track", 0.012, 4.48, now);
    assert.equal(Object.keys(ledger.reservations).length, 1);
  });
});

describe("AeroAPI client URLs and charged failures", () => {
  let fetchStub: sinon.SinonStub;
  let reservations: any;
  let api: any;

  beforeEach(() => {
    resetAeroApiUsageCacheForTests();
    reservations = null;
    const monthRef = {
      transaction: sinon.stub().callsFake(async (update) => {
        const next = update(reservations);
        if (next !== undefined) reservations = next;
        return { committed: next !== undefined };
      })
    };
    const budgetRoot = { child: sinon.stub().returns(monthRef) };
    fetchStub = sinon.stub(globalThis, "fetch");
    api = proxyquire.noCallThru()("../src/autocomplete/aero-api/loadFlight", {
      "firebase-admin": {
        apps: [{}],
        database: () => ({ ref: () => budgetRoot })
      },
      "firebase-functions/params": {
        defineJsonSecret: () => ({ value: () => ({ aeroapi: { apikey: "test" } }) })
      },
      "firebase-functions/logger": logger
    });
  });

  afterEach(() => sinon.restore());

  it("uses direct IATA designator, one page, encoded dates and never an operator endpoint", async () => {
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ total_discount_cost: 0 }) });
    fetchStub.onSecondCall().resolves({ ok: true, json: async () => ({ flights: [] }) });
    assert.deepEqual(await api.loadAeroApiFlights("LH400", "2026-09-10", now), []);
    const url = new URL(fetchStub.secondCall.args[0]);
    assert.equal(url.pathname, "/aeroapi/flights/LH400");
    assert.equal(url.searchParams.get("ident_type"), "designator");
    assert.equal(url.searchParams.get("max_pages"), "1");
    assert.equal(fetchStub.getCalls().some((call) => call.args[0].includes("/operators/")), false);
  });

  it("reserves before a failed billable request and keeps the charge estimate", async () => {
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ total_discount_cost: 0 }) });
    fetchStub.onSecondCall().rejects(new Error("offline"));
    await assert.rejects(api.loadAeroApiFlights("LH400", "2026-09-10", now), /offline/);
    assert.equal(Object.values(reservations.reservations).length, 1);
  });

  it("requests estimated track only when explicitly asked and removes surface positions", async () => {
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ total_discount_cost: 0 }) });
    fetchStub.onSecondCall().resolves({
      ok: true, json: async () => ({
        actual_distance: 10,
        positions: [
          { altitude: 0, update_type: "A" },
          { altitude: 10, update_type: "P" },
          { altitude: 10, update_type: "A" }
        ]
      })
    });
    const track = await api.loadAeroApiTrack("fa/id", false, now);
    assert.equal(new URL(fetchStub.secondCall.args[0]).searchParams.get("include_estimated_positions"), "false");
    assert.equal(track.positions.length, 1);
    assert.match(fetchStub.secondCall.args[0], /fa%2Fid/);
  });
});

describe("Refresh lifecycle", () => {
  const lockRoot = (initial: any) => {
    let value = initial;
    const node = {
      transaction: sinon.stub().callsFake(async (update) => {
        const next = update(value);
        if (next !== undefined) value = next;
        return {
          committed: next !== undefined,
          snapshot: { val: () => structuredClone(value) },
        };
      })
    };
    return { root: { child: sinon.stub().returns(node) }, get value() { return value; } };
  };

  it("acquires one short-lived lock, rejects a race, and permits expiry", async () => {
    const store = lockRoot(null);
    const owner = await acquireEnrichmentLock(store.root as any, "u", "f", now);
    assert.ok(owner);
    assert.equal(await acquireEnrichmentLock(store.root as any, "u", "f", now), null);
    assert.equal(store.value.rerunRequested, true);
    assert.equal(await releaseEnrichmentLock(store.root as any, "u", "f", owner!), true);
    assert.ok(await acquireEnrichmentLock(store.root as any, "u", "f", now));
    store.value.expiresAt = now.valueOf() - 1;
    assert.ok(await acquireEnrichmentLock(
      store.root as any, "u", "f", new Date(now.valueOf() + 120_001)
    ));
  });

  it("only releases a lock owned by the supplied token", async () => {
    const store = lockRoot({ token: "mine", expiresAt: now.valueOf() + 1000 });
    await releaseEnrichmentLock(store.root as any, "u", "f", "other");
    assert.equal(store.value.token, "mine");
    await releaseEnrichmentLock(store.root as any, "u", "f", "mine");
    assert.equal(store.value, null);
  });

  it("queues after arrival grace with bounded increasing attempts", () => {
    const first = nextRefreshAt(candidate(), 0, new Date("2026-09-11T05:00:00Z"));
    assert.equal(first, "2026-09-11T07:15:00.000Z");
    assert.equal(nextRefreshAt(candidate(), 3, now), null);
  });

  it("does not queue beyond nine days after departure", () => {
    assert.equal(nextRefreshAt(candidate(), 0, new Date("2026-09-20T23:00:00Z")), null);
  });

  it("creates a compact explicit refresh job", () => {
    const job = makeRefreshJob("u", "f", "LH400", "2026-09-11", candidate(), 1,
      new Date("2026-09-11T05:00:00Z"));
    assert.deepEqual(Object.keys(job!).sort(), [
      "attempts", "date", "faFlightId", "flightId", "flightno", "nextAttemptAt", "userId"
    ]);
  });

  it("backs off thrown jobs and removes them after the third failed attempt", () => {
    const initial = {
      userId: "u", flightId: "f", faFlightId: "fa", flightno: "LH400",
      date: "2026-09-11", attempts: 0, nextAttemptAt: "2026-09-11T11:00:00Z",
    };
    const first = retryRefreshJobAfterFailure(initial, now)!;
    assert.equal(first.attempts, 1);
    assert.ok(Date.parse(first.nextAttemptAt) > now.valueOf());
    const second = retryRefreshJobAfterFailure(first, now)!;
    assert.equal(second.attempts, 2);
    assert.equal(retryRefreshJobAfterFailure(second, now), null);
  });
});
