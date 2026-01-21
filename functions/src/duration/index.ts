import * as functions from "firebase-functions/v1";
import DayJS from "dayjs";
import loadFlight from "../util/loadFlight";

export const computeDuration = async (snapshot: functions.database.DataSnapshot, context: functions.EventContext) => {
  const flightId = context.params.flightId;
  const userId = context.params.userId;
  console.log(`Computing Duration for Flight ${flightId} (User: ${userId})`);

  const flightRef = snapshot.ref.parent;
  if (!flightRef) return;

  const flight = await loadFlight(flightRef);
  if (!flight) return;

  if (flight.departureTime && flight.arrivalTime) {
    const dep = DayJS(flight.departureTime);
    const arr = DayJS(flight.arrivalTime);

    if (dep.isValid() && arr.isValid()) {
      const durationMs = arr.diff(dep);
      if (durationMs > 0) {
        console.log(`Calculated duration for ${flightId}: ${durationMs}ms`);
        await flightRef.child("durationMilliseconds").set(durationMs);
      } else {
        console.warn(`Calculated duration for ${flightId} is non-positive: ${durationMs}ms.`);
      }
    } else {
      console.error(`Invalid times for flight ${flightId}: dep=${flight.departureTime}, arr=${flight.arrivalTime}`);
    }
  }
};

export default {
  updatedDepartureTime: functions.database.ref("/users/{userId}/flights/{flightId}/departureTime")
    .onUpdate((change, context) => computeDuration(change.after, context)),

  updatedDepartureTimeOnCreate: functions.database.ref("/users/{userId}/flights/{flightId}/departureTime")
    .onCreate(computeDuration),

  updatedArrivalTime: functions.database.ref("/users/{userId}/flights/{flightId}/arrivalTime")
    .onUpdate((change, context) => computeDuration(change.after, context)),

  updatedArrivalTimeCreate: functions.database.ref("/users/{userId}/flights/{flightId}/arrivalTime")
    .onCreate(computeDuration),
};
