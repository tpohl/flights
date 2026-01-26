import { onValueUpdated, onValueCreated } from "firebase-functions/v2/database";
import { log, warn, error } from "firebase-functions/logger";
import DayJS from "dayjs";
import loadFlight from "../util/loadFlight";
import * as admin from "firebase-admin";

export const computeDuration = async (flightRef: admin.database.Reference, flightId: string, userId: string) => {
  log(`Computing Duration for Flight ${flightId} (User: ${userId})`);

  const flight = await loadFlight(flightRef);
  if (!flight) return;

  if (flight.departureTime && flight.arrivalTime) {
    const dep = DayJS(flight.departureTime);
    const arr = DayJS(flight.arrivalTime);

    if (dep.isValid() && arr.isValid()) {
      const durationMs = arr.diff(dep);
      if (durationMs > 0) {
        log(`Calculated duration for ${flightId}: ${durationMs}ms`);
        await flightRef.child("durationMilliseconds").set(durationMs);
      } else {
        warn(`Calculated duration for ${flightId} is non-positive: ${durationMs}ms.`);
      }
    } else {
      error(`Invalid times for flight ${flightId}: dep=${flight.departureTime}, arr=${flight.arrivalTime}`);
    }
  }
};

export const updatedDepartureTime = onValueUpdated("/users/{userId}/flights/{flightId}/departureTime", async (event) => {
  const flightRef = event.data.after.ref.parent!;
  return computeDuration(flightRef, event.params.flightId, event.params.userId);
});

export const updatedDepartureTimeOnCreate = onValueCreated("/users/{userId}/flights/{flightId}/departureTime", async (event) => {
  const flightRef = event.data.ref.parent!;
  return computeDuration(flightRef, event.params.flightId, event.params.userId);
});

export const updatedArrivalTime = onValueUpdated("/users/{userId}/flights/{flightId}/arrivalTime", async (event) => {
  const flightRef = event.data.after.ref.parent!;
  return computeDuration(flightRef, event.params.flightId, event.params.userId);
});

export const updatedArrivalTimeCreate = onValueCreated("/users/{userId}/flights/{flightId}/arrivalTime", async (event) => {
  const flightRef = event.data.ref.parent!;
  return computeDuration(flightRef, event.params.flightId, event.params.userId);
});
