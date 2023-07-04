import { Flight } from './../models/flight';
/**
 * Functions for flight duration computation.
 */

import { tap, map, mergeMap } from 'rxjs/operators';
import DayJS from 'dayjs';
import DayJSDuration from 'dayjs/plugin/duration';

DayJS.extend(DayJSDuration);
import { from } from "rxjs";
import * as functions from 'firebase-functions';
import loadFlight from '../util/loadFlight';



const computeDuration = function (snapshot: functions.database.DataSnapshot, context: functions.EventContext) {
  console.log('Computing Duration of Flight.');
  const flightRef = snapshot.ref.parent;
  return loadFlight(flightRef)
    .pipe(
      map((flight: Flight) => {
        if (flight.departureTime && flight.arrivalTime) {
          flight.durationMilliseconds = DayJS.duration(DayJS(flight.arrivalTime).diff(DayJS(flight.departureTime))).asMilliseconds();
        }
        return flight;
      }
      ),
      tap(flight => console.log('Computed Duration of Flight', flight)),
      mergeMap(newFlight => from(snapshot.ref.parent.child('durationMilliseconds').set(newFlight.durationMilliseconds)))
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
