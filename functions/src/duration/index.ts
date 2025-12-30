import { Flight } from './../models/flight';
/**
 * Functions for flight duration computation.
 */

import { tap, map, mergeMap } from 'rxjs/operators';
import DayJS from 'dayjs';
import DayJSDuration from 'dayjs/plugin/duration';

DayJS.extend(DayJSDuration);
import { from, of } from "rxjs";
import * as functions from 'firebase-functions';
import loadFlight from '../util/loadFlight';



const computeDuration = function (snapshot: functions.database.DataSnapshot, context: functions.EventContext) {
  const flightId = context.params.flightId;
  const userId = context.params.userId;
  console.log(`Computing Duration for Flight ${flightId} (User: ${userId})`);

  const flightRef = snapshot.ref.parent;
  return loadFlight(flightRef)
    .pipe(
      map((flight: Flight) => {
        if (flight.departureTime && flight.arrivalTime) {
          const dep = DayJS(flight.departureTime);
          const arr = DayJS(flight.arrivalTime);

          if (dep.isValid() && arr.isValid()) {
            const durationMs = arr.diff(dep);
            if (durationMs > 0) {
              flight.durationMilliseconds = durationMs;
              console.log(`Calculated duration for ${flightId}: ${durationMs}ms`);
            } else {
              console.warn(`Calculated duration for ${flightId} is non-positive: ${durationMs}ms. Times: ${flight.departureTime} -> ${flight.arrivalTime}`);
            }
          } else {
            console.error(`Invalid times for flight ${flightId}: dep=${flight.departureTime}, arr=${flight.arrivalTime}`);
          }
        }
        return flight;
      }),
      mergeMap(flight => {
        if (flight.durationMilliseconds > 0) {
          return from(flightRef.child('durationMilliseconds').set(flight.durationMilliseconds));
        }
        return of(null);
      })
    ).toPromise();
};

export default {
  updatedDepartureTime: functions.database.ref('/users/{userId}/flights/{flightId}/departureTime')
    .onUpdate((change, context) => {
      return computeDuration(change.after, context);
    }),

  updatedDepartureTimeOnCreate: functions.database.ref('/users/{userId}/flights/{flightId}/departureTime')
    .onCreate(computeDuration),

  updatedArrivalTime: functions.database.ref('/users/{userId}/flights/{flightId}/arrivalTime')
    .onUpdate((change, context) => {
      return computeDuration(change.after, context);
    }),

  updatedArrivalTimeCreate: functions.database.ref('/users/{userId}/flights/{flightId}/arrivalTime')
    .onCreate(computeDuration)
};
