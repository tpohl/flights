import { Flight, FlightManualField } from "../models/flight";
import type * as admin from "firebase-admin";
import { isDeepStrictEqual } from "node:util";
import { log, warn } from "firebase-functions/logger";
import { parseFlightTime } from "./flightTime";

export type SaveFlightResult = {
  status: "saved" | "unchanged" | "missing" | "deleted" | "stale";
  flight: Flight | null;
};

const identityFields: (keyof Flight)[] = ["flightno", "date", "from", "to"];
const protectedFields = new Set([
  "_id", "_deleted", "flightno", "date", "manualOverrides", "durationMilliseconds",
]);
const equal = (left: unknown, right: unknown) => isDeepStrictEqual(left ?? null, right ?? null);

const saveFlightAndReturnIt = async function(
  flightRef: admin.database.Reference,
  original: Flight,
  enriched: Flight,
  options: { requireUnchangedAircraftTypeCode?: boolean } = {}
): Promise<SaveFlightResult> {
  const changedFields = (Object.keys(enriched) as (keyof Flight)[]).filter((key) =>
    !protectedFields.has(key) && enriched[key] !== undefined && !equal(original[key], enriched[key])
  );
  const outcome: { status: SaveFlightResult["status"] } = { status: "unchanged" };

  const result = await flightRef.transaction((current: Flight | null) => {
    if (!current) {
      outcome.status = "missing";
      // A cold transaction cache may initially be null. Let Firebase check the server,
      // without ever creating a record if it really is missing.
      return null;
    }
    if (current._deleted) {
      outcome.status = "deleted";
      return undefined;
    }
    if (identityFields.some((key) => !equal(current[key], original[key])) ||
        (options.requireUnchangedAircraftTypeCode &&
          !equal(current.aircraftTypeCode, original.aircraftTypeCode))) {
      outcome.status = "stale";
      return undefined;
    }

    const merged = { ...current };
    const timesChanged = !equal(current.departureTime, original.departureTime) ||
      !equal(current.arrivalTime, original.arrivalTime);
    for (const key of changedFields) {
      if (current.manualOverrides?.[key as FlightManualField] === true ||
          !equal(current[key], original[key])) {
        continue;
      }
      if ((key === "departureTime" || key === "arrivalTime") && timesChanged) continue;
      if (key === "aircraftType") {
        const codeCanChange = current.manualOverrides?.aircraftTypeCode !== true &&
          equal(current.aircraftTypeCode, original.aircraftTypeCode);
        const resultingCode = codeCanChange ? enriched.aircraftTypeCode : current.aircraftTypeCode;
        if (!equal(current.aircraftTypeCode, original.aircraftTypeCode) ||
            !equal(resultingCode, enriched.aircraftTypeCode)) {
          continue;
        }
      }
      if (enriched[key] === null) {
        delete merged[key];
      } else {
        Object.assign(merged, { [key]: enriched[key] });
      }
    }

    const dep = parseFlightTime(merged.departureTime);
    const arr = parseFlightTime(merged.arrivalTime);
    if (dep && arr && arr.diff(dep) <= 0 &&
        (!equal(merged.departureTime, current.departureTime) || !equal(merged.arrivalTime, current.arrivalTime))) {
      warn("Discarding enrichment times that conflict with the saved flight", { flightId: flightRef.key });
      for (const key of ["departureTime", "arrivalTime"] as const) {
        if (current[key] === undefined) delete merged[key];
        else merged[key] = current[key];
      }
      if (equal(current.errorMessage, original.errorMessage)) {
        merged.errorMessage = "Provider times conflict with the saved flight times. Please review them.";
      }
    }
    outcome.status = equal(merged, current) ? "unchanged" : "saved";
    return outcome.status === "saved" ? merged : undefined;
  }, undefined, false);

  const { status } = outcome;
  if (status === "stale" || status === "deleted" || status === "missing") {
    warn("Discarded flight enrichment", { flightId: flightRef.key, status });
  } else {
    log("Flight enrichment persistence", { flightId: flightRef.key, status });
  }
  return { status, flight: result.snapshot.val() as Flight | null };
};

export default saveFlightAndReturnIt;
