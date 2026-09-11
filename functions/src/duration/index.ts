import { onValueUpdated, onValueCreated, onValueDeleted } from "firebase-functions/v2/database";
import { log, warn } from "firebase-functions/logger";
import type * as admin from "firebase-admin";
import { Flight } from "../models/flight";
import { parseFlightTime } from "../util/flightTime";

export const computeDuration = async (flightRef: admin.database.Reference, flightId: string, userId: string) => {
  log(`Computing Duration for Flight ${flightId} (User: ${userId})`);

  return flightRef.transaction((flight: Flight | null) => {
    if (!flight) return null;
    if (flight._deleted) {
      warn("Skipping duration for deleted flight", { flightId });
      return undefined;
    }
    const dep = parseFlightTime(flight.departureTime);
    const arr = parseFlightTime(flight.arrivalTime);
    const durationMs = dep && arr ? arr.diff(dep) : 0;
    if (durationMs > 0) {
      if (flight.durationMilliseconds === durationMs) return undefined;
      return { ...flight, durationMilliseconds: durationMs };
    }
    if (flight.durationMilliseconds === undefined) return undefined;
    const updated = { ...flight };
    delete updated.durationMilliseconds;
    return updated;
  }, undefined, false);
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

export const updatedDepartureTimeOnDelete = onValueDeleted("/users/{userId}/flights/{flightId}/departureTime", async (event) => {
  return computeDuration(event.data.ref.parent!, event.params.flightId, event.params.userId);
});

export const updatedArrivalTimeOnDelete = onValueDeleted("/users/{userId}/flights/{flightId}/arrivalTime", async (event) => {
  return computeDuration(event.data.ref.parent!, event.params.flightId, event.params.userId);
});
