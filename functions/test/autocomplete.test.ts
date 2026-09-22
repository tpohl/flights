import { strict as assert } from "node:assert";
import * as sinon from "sinon";
import proxyquire from "proxyquire";
import { databaseTriggers, flightReference, logger } from "./helpers";
import {
  AeroApiBudgetExceededError
} from "../src/autocomplete/aero-api/budget";
import {
  FlightDateOutsideAeroApiWindowError
} from "../src/autocomplete/aero-api/matcher";

const now = new Date("2026-09-11T12:00:00Z");
const original = {
  _id: "flight123",
  flightno: "LH400",
  date: "2026-09-11",
  from: "FRA",
  to: "JFK",
  note: "Personal note",
  needsAutocomplete: true
};
const candidate = (overrides: any = {}) => ({
  fa_flight_id: "fa-1",
  ident_iata: "LH400",
  origin: { code_iata: "FRA", timezone: "Europe/Berlin" },
  destination: { code_iata: "JFK", timezone: "America/New_York" },
  scheduled_out: "2026-09-11T10:00:00Z",
  scheduled_in: "2026-09-11T18:00:00Z",
  ...overrides
});

describe("AeroAPI autocomplete coordinator", () => {
  let aero: any;
  let lifecycle: any;
  let autocompleteFlight: any;
  let autocompleteAircraftType: any;
  let processAeroApiRefreshQueue: any;
  let triggerAutocompleteOnCreate: any;
  let updateAutocompleteTrigger: any;
  let requestedAutocompleteTrigger: any;
  let internalNode: any;

  beforeEach(() => {
    aero = {
      loadAeroApiFlights: sinon.stub().resolves([candidate()]),
      loadAeroApiTrack: sinon.stub().resolves({ actual_distance: 0, positions: [] })
    };
    lifecycle = {
      internalKey: sinon.stub().returns("safe-key"),
      makeRefreshJob: sinon.stub().returns({
        userId: "u", flightId: "f", faFlightId: "fa-1", flightno: "LH400",
        date: "2026-09-11", attempts: 0, nextAttemptAt: "2026-09-11T18:45:00Z"
      }),
      acquireEnrichmentLock: sinon.stub().resolves("token"),
      releaseEnrichmentLock: sinon.stub().resolves(),
      retryRefreshJobAfterFailure: sinon.stub().callsFake((job) => ({
        ...job, attempts: job.attempts + 1, nextAttemptAt: "2026-09-11T14:00:00Z"
      }))
    };
    internalNode = {
      child: sinon.stub().returnsThis(),
      set: sinon.stub().resolves(),
      remove: sinon.stub().resolves(),
      transaction: sinon.stub().resolves(),
      orderByChild: sinon.stub().returnsThis(),
      endAt: sinon.stub().returnsThis(),
      limitToFirst: sinon.stub().returnsThis(),
      once: sinon.stub().resolves({ val: () => null })
    };
    const saveFlight = proxyquire.noCallThru()("../src/util/saveFlight", {
      "firebase-functions/logger": logger
    }).default;
    const module = proxyquire.noCallThru()("../src/autocomplete/index", {
      "firebase-admin": { database: () => ({ ref: sinon.stub().returns(internalNode) }) },
      "firebase-functions/v2/database": databaseTriggers,
      "firebase-functions/v2/https": { onRequest: (_options, handler) => handler },
      "firebase-functions/v2/scheduler": { onSchedule: (_options, handler) => handler },
      "firebase-functions/params": {
        defineJsonSecret: () => ({ value: () => ({ jwt: { secret: "test" } }) })
      },
      "firebase-functions/logger": logger,
      "jsonwebtoken": { verify: () => ({ userId: "user123", flightId: "flight123" }) },
      "./aero-api/loadFlight": aero,
      "./aero-api/lifecycle": lifecycle,
      "../util/saveFlight": { __esModule: true, default: saveFlight }
    });
    autocompleteFlight = module.autocompleteFlight;
    autocompleteAircraftType = module.autocompleteAircraftType;
    processAeroApiRefreshQueue = module.processAeroApiRefreshQueue;
    triggerAutocompleteOnCreate = module.triggerAutocompleteOnCreate;
    updateAutocompleteTrigger = module.lufthansaApiAutocompletion;
    requestedAutocompleteTrigger = module.autocompletionRequested;
  });

  afterEach(() => sinon.restore());

  it("selects, maps and persists a scheduled candidate without Lufthansa or operator calls", async () => {
    const ref = flightReference(original);
    const result = await autocompleteFlight(ref, { now });
    assert.equal(result.status, "saved");
    assert.equal(result.flight.flightAwareFlightId, "fa-1");
    assert.equal(result.flight.departureTime, "2026-09-11T10:00:00Z");
    assert.equal(result.flight.arrivalTime, "2026-09-11T18:00:00Z");
    assert.equal(result.flight.departureTimeSource, "scheduled");
    assert.equal(result.flight.aeroApiEnrichment.state, "scheduled");
    assert.equal(result.flight.needsAutocomplete, false);
    assert.equal("message" in result.flight.aeroApiEnrichment, false);
    assert.equal(aero.loadAeroApiTrack.firstCall.args[1], true);
  });

  it("consumes imported-flight suppression once and skips redelivery of the same create event", async () => {
    const ref = flightReference({
      ...original,
      needsAutocomplete: false,
      importMetadata: {
        source: "myflightradar24",
        sourceKey: "myfr24-123",
        importedAt: now.toISOString(),
        suppressInitialEnrichment: true
      }
    });
    const event = {
      id: "create-event-1",
      data: { ref: { parent: ref } },
      params: { userId: "user123", flightId: "flight123", now }
    };
    assert.equal(await triggerAutocompleteOnCreate(event), null);
    assert.equal(ref.current.importMetadata.suppressInitialEnrichment, false);
    assert.equal(ref.current.importMetadata.suppressedCreateEventId, "create-event-1");
    assert.equal(await triggerAutocompleteOnCreate(event), null);
    assert.equal(aero.loadAeroApiFlights.callCount, 0);
  });

  it("enriches a later recreated flight number after initial import suppression", async () => {
    const ref = flightReference({
      ...original,
      importMetadata: {
        source: "myflightradar24",
        sourceKey: "myfr24-123",
        importedAt: now.toISOString(),
        suppressInitialEnrichment: false,
        suppressedCreateEventId: "create-event-1"
      }
    });
    await triggerAutocompleteOnCreate({
      id: "create-event-2",
      data: { ref: { parent: ref } },
      params: { userId: "user123", flightId: "flight123", now }
    });
    assert.equal(aero.loadAeroApiFlights.callCount, 1);
  });

  it("keeps normal create, update, and explicit enrichment behavior", async () => {
    const createRef = flightReference(original);
    await triggerAutocompleteOnCreate({
      id: "normal-create",
      data: { ref: { parent: createRef } },
      params: { userId: "user123", flightId: "flight123", now }
    });
    assert.equal(aero.loadAeroApiFlights.callCount, 1);

    const updateRef = flightReference(original);
    await updateAutocompleteTrigger({
      data: { after: { ref: { parent: updateRef } } },
      params: { userId: "user123", flightId: "flight123", now }
    });
    assert.equal(aero.loadAeroApiFlights.callCount, 2);

    const requestedRef = flightReference({
      ...original,
      needsAutocomplete: true,
      importMetadata: {
        source: "myflightradar24",
        sourceKey: "myfr24-123",
        importedAt: now.toISOString()
      }
    });
    await requestedAutocompleteTrigger({
      data: { after: { val: () => true, ref: { parent: requestedRef } } },
      params: { userId: "user123", flightId: "flight123", now }
    });
    assert.equal(aero.loadAeroApiFlights.callCount, 3);
  });

  it("fails closed when initial suppression cannot be consumed", async () => {
    const ref = flightReference(original);
    ref.transaction.rejects(new Error("database unavailable"));
    await assert.rejects(triggerAutocompleteOnCreate({
      id: "create-event-1",
      data: { ref: { parent: ref } },
      params: { userId: "user123", flightId: "flight123" }
    }), /database unavailable/);
    assert.equal(aero.loadAeroApiFlights.callCount, 0);
  });

  it("uses final non-estimated track and persists final state", async () => {
    aero.loadAeroApiFlights.resolves([candidate({
      actual_out: "2026-09-11T10:10:00Z",
      actual_in: "2026-09-11T17:55:00Z"
    })]);
    aero.loadAeroApiTrack.resolves({ actual_distance: 100, positions: [] });
    const result = await autocompleteFlight(flightReference(original), { now });
    assert.equal(aero.loadAeroApiTrack.firstCall.args[1], false);
    assert.equal(result.flight.aeroApiEnrichment.state, "final");
    assert.equal(result.flight.flownDistance, 160.9344);
  });

  it("keeps selected flight details when the track budget is blocked", async () => {
    aero.loadAeroApiTrack.rejects(new AeroApiBudgetExceededError("Monthly budget reached."));
    const result = await autocompleteFlight(flightReference(original), { now });
    assert.equal(result.flight.flightAwareFlightId, "fa-1");
    assert.equal(result.flight.departureTime, "2026-09-11T10:00:00Z");
    assert.equal(result.flight.aeroApiEnrichment.state, "budget_blocked");
    assert.equal(result.flight.errorMessage, "Monthly budget reached.");
  });

  it("does not fetch track or apply a candidate when results are ambiguous", async () => {
    aero.loadAeroApiFlights.resolves([
      candidate({ fa_flight_id: "fa-1" }),
      candidate({ fa_flight_id: "fa-2" })
    ]);
    const stored = { ...original };
    delete stored.from;
    delete stored.to;
    const result = await autocompleteFlight(flightReference(stored), { now });
    assert.equal(result.flight.aeroApiEnrichment.state, "ambiguous");
    assert.equal(result.flight.flightAwareFlightId, undefined);
    assert.equal(aero.loadAeroApiTrack.callCount, 0);
  });

  it("records not-found without changing personal notes", async () => {
    aero.loadAeroApiFlights.resolves([]);
    const result = await autocompleteFlight(flightReference(original), { now });
    assert.equal(result.flight.aeroApiEnrichment.state, "not_found");
    assert.equal(result.flight.note, original.note);
  });

  it("rejects invalid input before any provider call", async () => {
    const result = await autocompleteFlight(flightReference({ ...original, flightno: "bad!" }), { now });
    assert.equal(result.flight.aeroApiEnrichment.state, "error");
    assert.equal(aero.loadAeroApiFlights.callCount, 0);
  });

  it("records outside-window and budget failures as explicit non-fatal states", async () => {
    for (const [error, state] of [
      [new FlightDateOutsideAeroApiWindowError("Outside recent window."), "outside_window"],
      [new AeroApiBudgetExceededError("Monthly budget reached."), "budget_blocked"]
    ] as const) {
      aero.loadAeroApiFlights.rejects(error);
      const result = await autocompleteFlight(flightReference(original), { now });
      assert.equal(result.flight.aeroApiEnrichment.state, state);
      assert.equal(result.flight.errorMessage, error.message);
      aero.loadAeroApiFlights.resetBehavior();
    }
  });

  it("uses stored AeroAPI data for historical flights without provider calls", async () => {
    const stored = candidate({
      actual_out: "2020-01-11T10:10:00Z",
      actual_in: "2020-01-11T17:55:00Z",
      fa_flight_id: "fa-stored"
    });
    const result = await autocompleteFlight(flightReference({
      ...original,
      date: "2020-01-11",
      aeroApiFlight: stored,
      flightAwareFlightId: "fa-stored"
    }), { now });
    assert.equal(result.status, "saved");
    assert.equal(result.flight.flightAwareFlightId, "fa-stored");
    assert.equal(result.flight.departureTime, stored.actual_out);
    assert.equal(result.flight.aeroApiEnrichment.state, "partial");
    assert.equal(aero.loadAeroApiFlights.callCount, 0);
    assert.equal(aero.loadAeroApiTrack.callCount, 0);
  });

  it("clears the request for an old flight without stored provider data", async () => {
    aero.loadAeroApiFlights.rejects(
      new FlightDateOutsideAeroApiWindowError("Outside recent window.")
    );
    const result = await autocompleteFlight(flightReference({
      ...original,
      date: "2020-01-11",
      needsAutocomplete: true
    }), { now });
    assert.equal(result.flight.aeroApiEnrichment.state, "outside_window");
    assert.equal(result.flight.needsAutocomplete, false);
    assert.equal(aero.loadAeroApiFlights.callCount, 0);
    assert.equal(aero.loadAeroApiTrack.callCount, 0);
  });

  it("preserves an unrelated existing error", async () => {
    aero.loadAeroApiFlights.resolves([]);
    const result = await autocompleteFlight(
      flightReference({ ...original, errorMessage: "Unrelated validation error" }), { now }
    );
    assert.equal(result.flight.errorMessage, "Unrelated validation error");
    assert.equal(result.flight.aeroApiEnrichment.message, "No matching AeroAPI flight was found.");
  });

  it("clears only a previous AeroAPI-owned error after success", async () => {
    const message = "No matching AeroAPI flight was found.";
    const ref = flightReference({
      ...original,
      errorMessage: message,
      aeroApiEnrichment: { state: "not_found", lastAttemptAt: now.toISOString(), message }
    });
    const result = await autocompleteFlight(ref, { now });
    assert.equal(result.flight.errorMessage, undefined);
    assert.equal(result.flight.aeroApiEnrichment.message, undefined);
  });

  it("honors manual fields through transactional persistence", async () => {
    const stored = {
      ...original,
      from: "FRA",
      departureTime: "2026-09-11T09:00:00Z",
      manualOverrides: { from: true, departureTime: true }
    };
    const result = await autocompleteFlight(flightReference(stored), { now });
    assert.equal(result.flight.from, "FRA");
    assert.equal(result.flight.departureTime, stored.departureTime);
    assert.equal(result.flight.departureTimeSource, "manual");
  });

  it("ignores stale provider routes and clears old provider data after a flight-number change", async () => {
    const stored = {
      ...original,
      flightno: "LH401",
      from: "FRA",
      to: "JFK",
      departureTime: "2026-09-10T10:05:00Z",
      arrivalTime: "manual arrival",
      scheduledDepartureTime: "2026-09-10T10:00:00Z",
      estimatedDepartureTime: "2026-09-10T10:03:00Z",
      actualDepartureTime: "2026-09-10T10:05:00Z",
      scheduledTakeoffTime: "2026-09-10T10:15:00Z",
      actualTakeoffTime: "2026-09-10T10:20:00Z",
      scheduledLandingTime: "2026-09-10T17:30:00Z",
      actualLandingTime: "2026-09-10T17:40:00Z",
      scheduledArrivalTime: "2026-09-10T18:00:00Z",
      actualArrivalTime: "2026-09-10T17:50:00Z",
      plannedDistance: 6200,
      flownDistance: 6250,
      aircraftTypeCode: "B744",
      aircraftType: "Manual favorite aircraft",
      aircraftRegistration: "D-OLD",
      carrier: "Old carrier",
      status: "landed",
      icaoCarrier: "DLH",
      cleanFlightNo: "400",
      flightAwareFlightId: "old-fa",
      aeroApiFlight: candidate({ fa_flight_id: "old-fa", ident_iata: "LH400" }),
      flightAwareFlight: { ident: "old" },
      lhApiFlight: { id: "old" },
      manualOverrides: { arrivalTime: true, aircraftType: true },
    };
    aero.loadAeroApiFlights.resolves([candidate({
      fa_flight_id: "new-fa",
      ident_iata: "LH401",
      origin: { code_iata: "MUC", timezone: "Europe/Berlin" },
      scheduled_out: "2026-09-11T11:00:00Z",
      scheduled_in: undefined,
    })]);
    const result = await autocompleteFlight(flightReference(stored), { now });

    assert.equal(result.flight.flightAwareFlightId, "new-fa");
    assert.equal(result.flight.from, "MUC");
    assert.equal(result.flight.to, "JFK");
    assert.equal(result.flight.departureTime, "2026-09-11T11:00:00Z");
    assert.equal(result.flight.arrivalTime, "manual arrival");
    assert.equal(result.flight.aircraftType, "Manual favorite aircraft");
    for (const key of [
      "actualDepartureTime", "estimatedDepartureTime", "actualTakeoffTime",
      "scheduledLandingTime", "actualLandingTime", "scheduledArrivalTime",
      "actualArrivalTime", "plannedDistance", "flownDistance", "aircraftTypeCode",
      "aircraftRegistration", "carrier", "icaoCarrier", "cleanFlightNo",
      "flightAwareFlight", "lhApiFlight",
    ]) {
      assert.equal(result.flight[key], undefined, `${key} should be cleared`);
    }
    assert.equal(result.flight.status, "scheduled");
    assert.equal(result.flight.aeroApiFlight.ident_iata, "LH401");
  });

  it("does not repeat a finalized cached track request", async () => {
    const flight = {
      ...original, flightAwareFlightId: "fa-1",
      aeroApiEnrichment: { state: "final", lastAttemptAt: now.toISOString() }
    };
    const ref = flightReference(flight);
    await ref.parent.parent.child("aeroApiTracks").child("fa-1").set({
      actual_distance: 100, positions: [{ update_type: "A", altitude: 10 }]
    });
    aero.loadAeroApiFlights.resolves([candidate({
      actual_out: "2026-09-11T10:10:00Z",
      actual_in: "2026-09-11T17:55:00Z"
    })]);
    const result = await autocompleteFlight(ref, { now });
    assert.equal(aero.loadAeroApiTrack.callCount, 0);
    assert.equal(result.flight.aeroApiEnrichment.state, "final");
  });

  it("discards enrichment when identity changes during persistence", async () => {
    const ref = flightReference(original);
    ref.retryWith({ ...original, flightno: "LH401" });
    assert.equal((await autocompleteFlight(ref, { now })).status, "stale");
  });

  it("propagates persistence failures", async () => {
    const ref = flightReference(original);
    const failure = new Error("Firebase unavailable");
    ref.transaction.rejects(failure);
    await assert.rejects(autocompleteFlight(ref, { now }), (err) => err === failure);
  });

  it("uses a per-flight lock to collapse racing triggers", async () => {
    lifecycle.acquireEnrichmentLock.resolves(null);
    const ref = flightReference(original);
    const result = await autocompleteFlight(ref, {
      userId: "user123", flightId: "flight123", now
    });
    assert.equal(result.status, "unchanged");
    assert.equal(aero.loadAeroApiFlights.callCount, 0);
  });

  it("releases the lock after provider failure", async () => {
    aero.loadAeroApiFlights.rejects(new Error("offline"));
    await autocompleteFlight(flightReference(original), {
      userId: "user123", flightId: "flight123", now
    });
    assert.equal(lifecycle.releaseEnrichmentLock.callCount, 1);
  });

  it("reruns against the latest identity when a racing trigger marks the lock pending", async () => {
    let resolveFirst!: (value: any[]) => void;
    const firstLookup = new Promise<any[]>((resolve) => { resolveFirst = resolve; });
    aero.loadAeroApiFlights.onFirstCall().returns(firstLookup);
    aero.loadAeroApiFlights.onSecondCall().resolves([
      candidate({ ident_iata: "LH401" }),
    ]);
    lifecycle.acquireEnrichmentLock.onFirstCall().resolves("owner");
    lifecycle.acquireEnrichmentLock.onSecondCall().resolves(null);
    lifecycle.acquireEnrichmentLock.onThirdCall().resolves("rerun");
    lifecycle.releaseEnrichmentLock.onFirstCall().resolves(true);
    lifecycle.releaseEnrichmentLock.onSecondCall().resolves(false);
    const ref = flightReference({ ...original, flightAwareFlightId: "old-scheduled-id" });

    const oldWork = autocompleteFlight(ref, {
      userId: "user123", flightId: "flight123", now,
      expectedFaFlightId: "old-scheduled-id",
    });
    for (let tick = 0; tick < 10 && aero.loadAeroApiFlights.callCount === 0; tick++) {
      await Promise.resolve();
    }
    ref.current = { ...original, flightno: "LH401" };
    const contender = await autocompleteFlight(ref, {
      userId: "user123", flightId: "flight123", now,
    });
    assert.equal(contender.status, "unchanged");
    resolveFirst([candidate()]);
    const result = await oldWork;

    assert.equal(aero.loadAeroApiFlights.callCount, 2);
    assert.equal(aero.loadAeroApiFlights.secondCall.args[0], "LH401");
    assert.equal(result.flight.flightno, "LH401");
  });

  it("leaves a recovery job when final track persistence fails", async () => {
    aero.loadAeroApiFlights.resolves([candidate({
      actual_out: "2026-09-11T10:10:00Z",
      actual_in: "2026-09-11T17:55:00Z",
    })]);
    aero.loadAeroApiTrack.resolves({ actual_distance: 100, positions: [] });
    const ref = flightReference(original);
    const failure = new Error("track storage unavailable");
    ref.trackSet.rejects(failure);
    await assert.rejects(
      autocompleteFlight(ref, { userId: "user123", flightId: "flight123", now }),
      /Could not save AeroAPI track/
    );
    assert.equal(ref.current.aeroApiEnrichment.state, "final");
    assert.equal(internalNode.set.callCount, 1);
    assert.equal(internalNode.remove.callCount, 0);
    sinon.assert.callOrder(internalNode.set, ref.trackSet);
  });

  it("standalone aircraft updates make no provider call and preserve the record", async () => {
    const ref = flightReference({ ...original, aircraftTypeCode: "B744", aircraftType: "747" });
    const result = await autocompleteAircraftType(ref);
    assert.equal(result.status, "unchanged");
    assert.equal(ref.transaction.callCount, 0);
  });

  it("processes at most three due refresh jobs and isolates per-job failures", async () => {
    const jobs = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [
      `job-${index}`,
      {
        userId: "u", flightId: `f-${index}`, faFlightId: `fa-${index}`,
        flightno: "LH400", date: "2026-09-11", attempts: 0,
        nextAttemptAt: "2026-09-11T11:00:00Z"
      }
    ]));
    const removed: string[] = [];
    const updated: Array<{ key: string; job: any }> = [];
    const queue: any = {
      orderByChild: sinon.stub().returnsThis(),
      endAt: sinon.stub().returnsThis(),
      limitToFirst: sinon.stub().returnsThis(),
      once: sinon.stub().resolves({ val: () => jobs }),
      child: sinon.stub().callsFake((key) => ({
        remove: sinon.stub().callsFake(async () => { removed.push(key); }),
        set: sinon.stub().callsFake(async (job) => { updated.push({ key, job }); })
      }))
    };
    const database = {
      ref: sinon.stub().callsFake((path) =>
        path === "/internal" ? { child: sinon.stub().returns(queue) } : { path })
    };
    const worker = sinon.stub();
    worker.onFirstCall().rejects(new Error("one job failed"));
    worker.onSecondCall().resolves({ status: "missing", flight: null });
    worker.onThirdCall().resolves({
      status: "saved",
      flight: { aeroApiEnrichment: { state: "final" } }
    });
    await processAeroApiRefreshQueue(now, { database, worker });
    assert.equal(worker.callCount, 3);
    assert.deepEqual(removed.sort(), ["job-1", "job-2"]);
    assert.equal(updated[0].key, "job-0");
    assert.equal(updated[0].job.attempts, 1);
    assert.ok(Date.parse(updated[0].job.nextAttemptAt) > now.valueOf());
  });

  it("removes a refresh job when its third worker attempt throws", async () => {
    const removed: string[] = [];
    const queue: any = {
      orderByChild: sinon.stub().returnsThis(),
      endAt: sinon.stub().returnsThis(),
      limitToFirst: sinon.stub().returnsThis(),
      once: sinon.stub().resolves({ val: () => ({
        finalTry: {
          userId: "u", flightId: "f", faFlightId: "fa", flightno: "LH400",
          date: "2026-09-11", attempts: 2, nextAttemptAt: "2026-09-11T11:00:00Z",
        },
      }) }),
      child: sinon.stub().callsFake((key) => ({
        remove: sinon.stub().callsFake(async () => { removed.push(key); }),
        set: sinon.stub().resolves(),
      })),
    };
    const database = {
      ref: sinon.stub().callsFake((path) =>
        path === "/internal" ? { child: sinon.stub().returns(queue) } : { path })
    };
    lifecycle.retryRefreshJobAfterFailure.returns(null);
    await processAeroApiRefreshQueue(now, {
      database, worker: sinon.stub().rejects(new Error("charged request failed")),
    });
    assert.deepEqual(removed, ["finalTry"]);
  });
});
