import * as functions from "firebase-functions/v1";
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

export const computeDistance = async (snapshot: functions.database.DataSnapshot, context: functions.EventContext) => {
  console.log("Computing Distance");
  const flightRef = snapshot.ref.parent;
  if (!flightRef) return;

  const flight = await loadFlight(flightRef);
  if (!flight || !flight.from || !flight.to) {
    console.log("Missing flight data or airports, skipping distance calculation");
    return;
  }

  const fromAirportSnap = await admin.database().ref(`/airports/${flight.from}`).once("value");
  const toAirportSnap = await admin.database().ref(`/airports/${flight.to}`).once("value");

  const ap1 = fromAirportSnap.val() as Airport;
  const ap2 = toAirportSnap.val() as Airport;

  if (ap1 && ap2) {
    const dist = calculateDistance(ap1.latitude, ap1.longitude, ap2.latitude, ap2.longitude);
    if (dist > 0) {
      console.log(`Computed Distance of Flight ${context.params.flightId}: ${dist} km`);
      await flightRef.child("distance").set(dist);
    }
  } else {
    console.warn(`Could not find airport data for ${flight.from} or ${flight.to}`);
  }
};

export default {
  updatedDepartureAirport: functions.database.ref("/users/{userId}/flights/{flightId}/from")
    .onUpdate((change, context) => computeDistance(change.after, context)),

  updatedDepartureAirportOnCreate: functions.database.ref("/users/{userId}/flights/{flightId}/from")
    .onCreate(computeDistance),

  updatedArrivalAirport: functions.database.ref("/users/{userId}/flights/{flightId}/to")
    .onUpdate((change, context) => computeDistance(change.after, context)),

  updatedArrivalAirportCreate: functions.database.ref("/users/{userId}/flights/{flightId}/to")
    .onCreate(computeDistance),
};
