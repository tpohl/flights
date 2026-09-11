import { strict as assert } from "node:assert";
import proxyquire from "proxyquire";
import { databaseTriggers, flightReference, logger } from "./helpers";

const duration = proxyquire.noCallThru()("../src/duration/index", {
  "firebase-functions/v2/database": databaseTriggers,
  "firebase-functions/logger": logger
});
const times = { departureTime: "2023-10-27T10:00:00Z", arrivalTime: "2023-10-27T12:00:00Z", note: "Keep" };

describe("Duration transaction", () => {
  it("calculates a positive duration without replacing other fields", async () => {
    const ref = flightReference(times);
    await duration.computeDuration(ref, "flight123", "user123");
    assert.equal(ref.current.durationMilliseconds, 7200000);
    assert.equal(ref.current.note, "Keep");
    assert.equal(ref.transaction.callCount, 1);
  });

  it("handles explicit next-day arrival", async () => {
    const ref = flightReference({ ...times, departureTime: "2023-10-27T23:00:00Z", arrivalTime: "2023-10-28T01:00:00Z" });
    await duration.computeDuration(ref, "flight123", "user123");
    assert.equal(ref.current.durationMilliseconds, 7200000);
  });

  for (const invalid of [
    { arrivalTime: undefined }, { departureTime: undefined }, { arrivalTime: "" },
    { arrivalTime: "invalid" }, { departureTime: null }, { departureTime: "2023-02-30T10:00:00Z" },
    { arrivalTime: "2023-10-27T24:00:00Z" }, { arrivalTime: "2023-10-27T09:00:00Z" },
    { arrivalTime: times.departureTime }, { arrivalTime: "2023-10-27" },
    { arrivalTime: "2023-10-27T12:00:00" }, { departureTime: "2023-10-27T10:00:00" }
  ]) {
    it(`clears a stale duration for ${JSON.stringify(invalid)}`, async () => {
      const ref = flightReference({ ...times, durationMilliseconds: 12345, ...invalid });
      await duration.computeDuration(ref, "flight123", "user123");
      assert.equal(ref.current.durationMilliseconds, undefined);
      assert.equal(ref.current.note, "Keep");
    });
  }

  it("recomputes against the latest times on a transaction retry", async () => {
    const ref = flightReference(times);
    ref.retryWith({ ...times, arrivalTime: "2023-10-27T13:00:00Z", note: "New note" });
    await duration.computeDuration(ref, "flight123", "user123");
    assert.equal(ref.current.durationMilliseconds, 10800000);
    assert.equal(ref.current.note, "New note");
  });

  it("clears a duration if a time was removed during the transaction", async () => {
    const ref = flightReference(times);
    ref.retryWith({ departureTime: times.departureTime, durationMilliseconds: 12345 });
    await duration.computeDuration(ref, "flight123", "user123");
    assert.equal(ref.current.durationMilliseconds, undefined);
  });

  for (const current of [null, { ...times, _deleted: true }]) {
    it(`does not change a ${current ? "deleted" : "missing"} record`, async () => {
      const ref = flightReference(times);
      ref.retryWith(current);
      await duration.computeDuration(ref, "flight123", "user123");
      assert.deepEqual(ref.current, current);
    });
  }

  it("handles Firebase's initially empty transaction cache", async () => {
    const ref = flightReference(null);
    ref.retryWith(times);
    await duration.computeDuration(ref, "flight123", "user123");
    assert.equal(ref.current.durationMilliseconds, 7200000);
  });

  for (const name of ["updatedDepartureTimeOnDelete", "updatedArrivalTimeOnDelete"]) {
    it(`${name} invalidates duration when a time field is deleted`, async () => {
      const ref = flightReference({ durationMilliseconds: 12345 });
      await duration[name]({ data: { ref: { parent: ref } }, params: { flightId: "flight123", userId: "user123" } });
      assert.equal(ref.current.durationMilliseconds, undefined);
    });
  }

  it("does not rewrite an already correct duration", async () => {
    const ref = flightReference({ ...times, durationMilliseconds: 7200000 });
    assert.equal((await duration.computeDuration(ref, "flight123", "user123")).committed, false);
  });
});
