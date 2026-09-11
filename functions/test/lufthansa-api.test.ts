import { strict as assert } from "node:assert";
import * as sinon from "sinon";
import proxyquire from "proxyquire";
import { logger } from "./helpers";
import { toFlight } from "../src/autocomplete/lufthansa-api/transformers";
import { Flight } from "../src/models/flight";

const stored = {
  flightno: "LH400", date: "2020-01-01", from: "FRA", to: "JFK",
  aircraftTypeCode: "744", aircraftType: "Boeing 747", note: "Private note",
  departureTime: "2020-01-01T12:00:00Z", arrivalTime: "2020-01-01T13:00:00Z"
} as Flight;
const route = { Departure: { AirportCode: "FRA" }, Arrival: { AirportCode: "JFK" } };
const response = (flight: any) => ({
  ok: true, json: async () => ({ FlightStatusResource: { Flights: { Flight: flight } } })
});

describe("Lufthansa enrichment failures and unavailable data", () => {
  let fetchStub: sinon.SinonStub;
  let tokenStub: sinon.SinonStub;
  let api: any;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, "fetch").rejects(new Error("Unexpected network request"));
    tokenStub = sinon.stub().resolves({ token: { access_token: "test" }, expired: () => false });
    const ClientCredentials = function () { this.getToken = tokenStub; };
    api = proxyquire.noCallThru()("../src/autocomplete/lufthansa-api-autocompletion", {
      "simple-oauth2": { ClientCredentials },
      "firebase-functions/params": {
        defineJsonSecret: () => ({ value: () => ({ lhapi: { clientid: "test", clientsecret: "test" } }) })
      },
      "firebase-functions/logger": logger
    }).default;
  });

  afterEach(() => sinon.restore());

  it("rejects non-OK responses without replacing or mutating the existing flight", async () => {
    const original = structuredClone(stored);
    fetchStub.resolves({ ok: false, status: 503 });
    await assert.rejects(api.autocomplete(stored.flightno, stored.date, original), /HTTP 503/);
    assert.deepEqual(original, stored);
    assert.equal(fetchStub.callCount, 1);
  });

  it("propagates token failures and does not call the flight API", async () => {
    tokenStub.rejects(new Error("Token failed"));
    const original = structuredClone(stored);
    await assert.rejects(api.autocomplete(stored.flightno, stored.date, original), /Token failed/);
    assert.deepEqual(original, stored);
    assert.equal(fetchStub.callCount, 0);
  });

  it("propagates fetch failures rather than returning the input as success", async () => {
    fetchStub.rejects(new Error("Network down"));
    await assert.rejects(api.autocomplete(stored.flightno, stored.date, structuredClone(stored)), /Network down/);
  });

  it("preserves the aircraft code and name if its HTTP lookup fails", async () => {
    const original = structuredClone(stored);
    fetchStub.onFirstCall().resolves(response({ ...route, Equipment: { AircraftCode: "320" } }));
    fetchStub.onSecondCall().resolves({ ok: false, status: 404 });
    await assert.rejects(api.autocomplete(stored.flightno, stored.date, original), /HTTP 404/);
    assert.deepEqual(original, stored);
  });

  it("rejects a failed standalone aircraft lookup instead of returning its code", async () => {
    fetchStub.resolves({ ok: false, status: 503 });
    await assert.rejects(api.loadAircraftType("744", "Boeing 747"), /HTTP 503/);
  });

  it("rejects missing aircraft names", async () => {
    fetchStub.resolves({
      ok: true, json: async () => ({
        AircraftResource: { AircraftSummaries: { AircraftSummary: { Names: { Name: { $: "" } } } } }
      })
    });
    await assert.rejects(api.loadAircraftType("744", "Boeing 747"), /no aircraft type name/);
  });

  it("rejects empty flight responses", async () => {
    fetchStub.resolves(response([]));
    await assert.rejects(api.autocomplete(stored.flightno, stored.date, structuredClone(stored)), /no usable flight/);
  });

  it("does not invent a date for a flight with no date", async () => {
    await assert.rejects(api.autocomplete(stored.flightno, "", structuredClone(stored)), /required/);
    assert.equal(fetchStub.callCount, 0);
  });

  it("keeps unknown times unknown, even when a usable route is returned", async () => {
    fetchStub.resolves(response(route));
    const result = await api.autocomplete("LH400", "2020-01-01", { flightno: "LH400", date: "2020-01-01" });
    assert.equal(result.departureTime, undefined);
    assert.equal(result.arrivalTime, undefined);
    assert.equal(result.from, "FRA");
    assert.equal(result.to, "JFK");
    assert.equal(fetchStub.callCount, 1);
  });

  it("leaves stored legacy values untouched when provider fields are missing", () => {
    const original = structuredClone(stored);
    const result = toFlight(route as any, original);
    for (const field of ["departureTime", "arrivalTime", "aircraftTypeCode", "aircraftType", "note"]) {
      assert.equal(result[field], stored[field]);
    }
    assert.notEqual(result, original);
    assert.deepEqual(original, stored);
  });

  it("honors original manual markers before aircraft lookup and avoids repopulating cleared times", async () => {
    const original = {
      ...stored, aircraftTypeCode: "744", arrivalTime: "",
      manualOverrides: { aircraftTypeCode: true, aircraftType: true, arrivalTime: true }
    };
    fetchStub.resolves(response({
      ...route, Arrival: { AirportCode: "JFK", ScheduledTimeUTC: { DateTime: "2020-01-01T15:00:00Z" } },
      Equipment: { AircraftCode: "320" }
    }));
    const result = await api.autocomplete(stored.flightno, stored.date, original);
    assert.equal(result.aircraftTypeCode, "744");
    assert.equal(result.aircraftType, "Boeing 747");
    assert.equal(result.arrivalTime, "");
    assert.equal(fetchStub.callCount, 1);
  });

  it("uses available actual times with scheduled fallback without dropping notes", () => {
    const result = toFlight({
      ...route,
      Departure: {
        AirportCode: "FRA", ActualTimeUTC: { DateTime: "" },
        ScheduledTimeUTC: { DateTime: "2020-01-01T10:00:00Z" }
      },
      Arrival: {
        AirportCode: "JFK", ActualTimeUTC: { DateTime: "2020-01-01T15:00:00Z" },
        ScheduledTimeUTC: { DateTime: "2020-01-01T14:00:00Z" }
      }
    } as any, stored);
    assert.equal(result.departureTime, "2020-01-01T10:00:00Z");
    assert.equal(result.arrivalTime, "2020-01-01T15:00:00Z");
    assert.equal(result.note, stored.note);
  });

  it("looks up a manually selected code when the aircraft name override is reset", async () => {
    const original = {
      ...stored, aircraftTypeCode: "320",
      manualOverrides: { aircraftTypeCode: true, aircraftType: false }
    };
    delete original.aircraftType;
    fetchStub.onFirstCall().resolves(response({ ...route, Equipment: { AircraftCode: "744" } }));
    fetchStub.onSecondCall().resolves({
      ok: true, json: async () => ({
        AircraftResource: {
          AircraftSummaries: { AircraftSummary: { Names: { Name: { $: "Airbus A320" } } } }
        }
      })
    });
    const result = await api.autocomplete(original.flightno, original.date, original);
    assert.match(fetchStub.secondCall.args[0], /\/aircraft\/320$/);
    assert.equal(result.aircraftTypeCode, "320");
    assert.equal(result.aircraftType, "Airbus A320");
    assert.deepEqual(result.manualOverrides, original.manualOverrides);
    assert.equal(original.aircraftType, undefined);
  });

  it("adds the known UTC offset to Lufthansa timestamps that omit it", () => {
    const result = toFlight({
      Departure: { AirportCode: "FRA", ScheduledTimeUTC: { DateTime: "2020-01-01T10:00:00" } },
      Arrival: { AirportCode: "JFK", ActualTimeUTC: { DateTime: "2020-01-01T15:00:00" } }
    } as any, stored);
    assert.equal(result.departureTime, "2020-01-01T10:00:00Z");
    assert.equal(result.arrivalTime, "2020-01-01T15:00:00Z");
  });

  it("rejects invalid UTC values rather than persisting a plausible normalized date", () => {
    assert.throws(() => toFlight({
      ...route, Departure: { AirportCode: "FRA", ScheduledTimeUTC: { DateTime: "2020-02-30T10:00:00" } }
    } as any, stored), /invalid UTC timestamp/);
  });
});
