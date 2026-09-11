import { strict as assert } from "node:assert";
import * as sinon from "sinon";
import proxyquire from "proxyquire";
import { databaseTriggers, flightReference, logger } from "./helpers";

describe("Distance manual-edit protection", () => {
  const original = { flightno: "LH400", date: "2020-01-01", from: "FRA", to: "JFK", distance: 500 };
  let computeDistance: any;
  let airports: sinon.SinonStub;

  beforeEach(() => {
    airports = sinon.stub().callsFake((path: string) => ({
      once: async () => ({
        val: () => path.endsWith("FRA") ? { latitude: 50, longitude: 8 } : { latitude: 40, longitude: -73 }
      })
    }));
    computeDistance = proxyquire.noCallThru()("../src/distance/index", {
      "firebase-admin": { database: () => ({ ref: airports }) },
      "firebase-functions/v2/database": databaseTriggers,
      "firebase-functions/logger": logger
    }).computeDistance;
  });

  it("still computes a distance for an unchanged route", async () => {
    const ref = flightReference(original);
    await computeDistance(ref, "flight123");
    assert.ok(ref.current.distance > 6000);
  });

  it("skips an explicitly entered distance", async () => {
    const ref = flightReference({ ...original, manualOverrides: { distance: true } });
    await computeDistance(ref, "flight123");
    assert.equal(ref.current.distance, 500);
    assert.equal(airports.callCount, 0);
  });

  for (const current of [
    { ...original, manualOverrides: { distance: true } },
    { ...original, distance: 123 },
    { ...original, from: "MUC" },
    { ...original, _deleted: true },
    null
  ]) {
    it(`preserves a newer route, edit or deletion: ${JSON.stringify(current)}`, async () => {
      const ref = flightReference(original);
      ref.retryWith(current);
      await computeDistance(ref, "flight123");
      assert.deepEqual(ref.current, current);
    });
  }
});
