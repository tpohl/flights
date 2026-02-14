import { onValueUpdated, onValueCreated } from "firebase-functions/v2/database";
import { log, warn } from "firebase-functions/logger";
import { Airport } from "../models/airport";

import loadFlight from "../util/loadFlight";

import * as admin from "firebase-admin";

const calculateDistance = (lat1: number, long1: number, lat2: number, long2: number) => {
  const p = 0.017453292519943295; // Math.PI / 180
  const c = Math.cos;
  const a = 0.5 - c((lat1 - lat2) * p) / 2 + c(lat2 * p) * c((lat1) * p) * (1 - c(((long1 - long2) * p))) / 2;
  const dis = Math.round((12742 * Math.asin(Math.sqrt(a)))); // 2 * R; R = 6371 km
  return dis;
};

export const computeDistance = async (flightRef: admin.database.Reference, flightId: string) => {
  log("Computing Distance");

  const flight = await loadFlight(flightRef);
  if (!flight || !flight.from || !flight.to) {
    log("Missing flight data or airports, skipping distance calculation");
    return;
  }

  const fromAirportSnap = await admin.database().ref(`/airports/${flight.from}`).once("value");
  const toAirportSnap = await admin.database().ref(`/airports/${flight.to}`).once("value");

  const ap1 = fromAirportSnap.val() as Airport;
  const ap2 = toAirportSnap.val() as Airport;

  if (ap1 && ap2) {
    const dist = calculateDistance(ap1.latitude, ap1.longitude, ap2.latitude, ap2.longitude);
    if (dist > 0) {
      log(`Computed Distance of Flight ${flightId}: ${dist} km`);
      await flightRef.child("distance").set(dist);
    }
  } else {
    warn(`Could not find airport data for ${flight.from} or ${flight.to}`);
  }
};

export const updatedDepartureAirport = onValueUpdated("/users/{userId}/flights/{flightId}/from", async (event) => {
  const flightRef = event.data.after.ref.parent!;
  return computeDistance(flightRef, event.params.flightId);
});

export const updatedDepartureAirportOnCreate = onValueCreated("/users/{userId}/flights/{flightId}/from", async (event) => {
  const flightRef = event.data.ref.parent!;
  return computeDistance(flightRef, event.params.flightId);
});

export const updatedArrivalAirport = onValueUpdated("/users/{userId}/flights/{flightId}/to", async (event) => {
  const flightRef = event.data.after.ref.parent!;
  return computeDistance(flightRef, event.params.flightId);
});

export const updatedArrivalAirportCreate = onValueCreated("/users/{userId}/flights/{flightId}/to", async (event) => {
  const flightRef = event.data.ref.parent!;
  return computeDistance(flightRef, event.params.flightId);
});
