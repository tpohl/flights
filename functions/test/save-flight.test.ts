import { strict as assert } from "node:assert";
import proxyquire from "proxyquire";
import { flightReference, logger } from "./helpers";
import { Flight, FlightManualField } from "../src/models/flight";

const saveFlight = proxyquire.noCallThru()("../src/util/saveFlight", {
  "firebase-functions/logger": logger
}).default;
const original = {
  flightno: "LH400", date: "2020-01-01", from: "FRA", to: "JFK",
  aircraftTypeCode: "744", aircraftType: "Boeing 747"
};

describe("Enrichment merge", () => {
  const overrides: FlightManualField[] = [
    "from", "to", "departureTime", "arrivalTime", "aircraftTypeCode", "aircraftType",
    "aircraftRegistration", "carrier", "distance"
  ];

  for (const field of overrides) {
    it(`preserves an explicit ${field} override even when unchanged since the request`, async () => {
      const stored = { ...original, [field]: "", manualOverrides: { [field]: true } };
      const ref = flightReference(stored);
      await saveFlight(ref, stored, { ...stored, [field]: field === "distance" ? 100 : "API value" });
      assert.equal(ref.current[field], "");
      assert.deepEqual(ref.current.manualOverrides, stored.manualOverrides);
    });
  }

  it("allows enrichment for a false override marker", async () => {
    const stored = { ...original, manualOverrides: { carrier: false } };
    const ref = flightReference(stored);
    await saveFlight(ref, stored, { ...stored, carrier: "Lufthansa" });
    assert.equal(ref.current.carrier, "Lufthansa");
  });

  it("ignores absent values and preserves newer arbitrary fields", async () => {
    const ref = flightReference({ ...original, extra: "Current", distance: 42 });
    const result = await saveFlight(ref, original, { ...original, aircraftType: undefined, carrier: "Lufthansa" });
    assert.equal(result.flight.aircraftType, original.aircraftType);
    assert.equal(result.flight.extra, "Current");
    assert.equal(result.flight.distance, 42);
  });

  it("does not overwrite a newer code or attach its old aircraft name", async () => {
    const current = { ...original, aircraftTypeCode: "320" };
    const ref = flightReference(current);
    await saveFlight(ref, original, { ...original, aircraftTypeCode: "748", aircraftType: "Boeing 747-8" });
    assert.equal(ref.current.aircraftTypeCode, "320");
    assert.equal(ref.current.aircraftType, original.aircraftType);
  });

  it("does not attach an aircraft name when a manual code blocks the corresponding code update", async () => {
    const current = { ...original, manualOverrides: { aircraftTypeCode: true } };
    const ref = flightReference(current);
    await saveFlight(ref, original, { ...original, aircraftTypeCode: "320", aircraftType: "Airbus A320" });
    assert.equal(ref.current.aircraftTypeCode, original.aircraftTypeCode);
    assert.equal(ref.current.aircraftType, original.aircraftType);
  });

  it("updates a corresponding aircraft code and name together", async () => {
    const ref = flightReference(original);
    await saveFlight(ref, original, { ...original, aircraftTypeCode: "320", aircraftType: "Airbus A320" });
    assert.equal(ref.current.aircraftTypeCode, "320");
    assert.equal(ref.current.aircraftType, "Airbus A320");
  });

  it("can enrich the name for an unchanged manually entered aircraft code", async () => {
    const stored = { ...original, manualOverrides: { aircraftTypeCode: true } };
    const ref = flightReference(stored);
    await saveFlight(ref, stored, { ...stored, aircraftType: "Boeing 747-400" });
    assert.equal(ref.current.aircraftType, "Boeing 747-400");
  });

  it("leaves identity, deletion, manual markers and independently derived duration alone", async () => {
    const ref = flightReference(original);
    await saveFlight(ref, original, {
      ...original, flightno: "LH401", date: "2021-01-01", _deleted: true,
      manualOverrides: { aircraftType: true }, durationMilliseconds: 1
    } as Flight);
    assert.deepEqual(ref.current, original);
  });

  it("returns the unchanged current record when no fields can be applied", async () => {
    const ref = flightReference(original);
    const result = await saveFlight(ref, original, { ...original });
    assert.equal(result.status, "unchanged");
    assert.deepEqual(result.flight, original);
  });

  it("handles Firebase's cold transaction cache without mistaking it for deletion", async () => {
    const ref = flightReference(null);
    ref.retryWith(original);
    const result = await saveFlight(ref, original, { ...original, carrier: "Lufthansa" });
    assert.equal(result.status, "saved");
    assert.equal(result.flight.carrier, "Lufthansa");
  });

  it("logs stale and removed work as discarded rather than saved", async () => {
    logger.warn.resetHistory();
    const ref = flightReference(null);
    assert.equal((await saveFlight(ref, original, original)).status, "missing");
    assert.equal(logger.warn.lastCall.args[0], "Discarded flight enrichment");
    assert.equal(logger.warn.lastCall.args[1].status, "missing");
  });

  it("does not apply half of a timing update after a concurrent correction", async () => {
    const stored = { ...original, departureTime: "2020-01-01T10:00:00Z", arrivalTime: "2020-01-01T12:00:00Z" };
    const current = { ...stored, departureTime: "2020-01-01T11:30:00Z" };
    const ref = flightReference(current);
    await saveFlight(ref, stored, { ...stored, arrivalTime: "2020-01-01T11:00:00Z" });
    assert.equal(ref.current.departureTime, current.departureTime);
    assert.equal(ref.current.arrivalTime, current.arrivalTime);
  });

  it("reports provider times incompatible with a saved manual correction", async () => {
    const stored = {
      ...original, departureTime: "2020-01-01T11:30:00Z", arrivalTime: "2020-01-01T12:00:00Z",
      manualOverrides: { departureTime: true }
    };
    const ref = flightReference(stored);
    await saveFlight(ref, stored, { ...stored, arrivalTime: "2020-01-01T11:00:00Z", carrier: "Lufthansa" });
    assert.equal(ref.current.departureTime, stored.departureTime);
    assert.equal(ref.current.arrivalTime, stored.arrivalTime);
    assert.equal(ref.current.carrier, "Lufthansa");
    assert.match(ref.current.errorMessage, /Provider times conflict/);
  });
});
