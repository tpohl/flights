import { Flight } from './../models/flight';
/**
 * Functions for flight disctance computation.
 */

import { flatMap, tap, map, filter } from 'rxjs/operators';
import { Airport } from './../models/airport';
import { from, Observable, zip } from "rxjs";
import * as functions from 'firebase-functions';
import { DataSnapshot } from 'firebase-functions/lib/providers/database';
import loadFlight from '../util/loadFlight';
const admin = require('firebase-admin');


const calculateDistance = function (lat1: number, long1: number, lat2: number, long2: number) {
  const p = 0.017453292519943295;    // Math.PI / 180
  const c = Math.cos;
  const a = 0.5 - c((lat1 - lat2) * p) / 2 + c(lat2 * p) * c((lat1) * p) * (1 - c(((long1 - long2) * p))) / 2;
  const dis = Math.round((12742 * Math.asin(Math.sqrt(a)))); // 2 * R; R = 6371 km
  return dis;
}
const addDistance = function (flight: Flight) {
  console.log('Adding Distance', flight);
  const fromAirport$ = from(admin.database().ref('/airports/' + flight.from).once('value')) as Observable<DataSnapshot>;
  const toAirport$ = from(admin.database().ref('/airports/' + flight.to).once('value')) as Observable<DataSnapshot>;

  return zip(fromAirport$, toAirport$)
    .pipe(map(ap => {
      const ap1 = ap[0].val() as Airport;
      const ap2 = ap[1].val() as Airport;
      flight.distance = calculateDistance(ap1.latitude, ap1.longitude, ap2.latitude, ap2.longitude);
      return flight;
    }));

}

const computeDistance = function (snapshot: functions.database.DataSnapshot, context: functions.EventContext) {
  console.log('Computing Distance');
  const flightRef = snapshot.ref.parent;
  return loadFlight(flightRef)
    .pipe(
      filter((flight: Flight) => {
        if (flight.from && flight.to) return true;
        else return false;
      }),
      flatMap(addDistance),
      tap(flight => console.log('Computed Distance of Flight', flight)),
      flatMap(newFlight => from(snapshot.ref.parent.child('distance').set(newFlight.distance)))
    ).toPromise();
};

export default {

  updatedDepartureTime: functions.database.ref('/users/{userId}/flights/{flightId}/from')
    .onUpdate((change, context) => {
      return computeDistance(change.after, context);
    }),


  updatedDepartureTimeOnCreate: functions.database.ref('/users/{userId}/flights/{flightId}/from')
    .onCreate(computeDistance),


  updatedArrivalTime: functions.database.ref('/users/{userId}/flights/{flightId}/to')
    .onUpdate((change, context) => {
      return computeDistance(change.after, context);
    }),


  updatedArrivalTimeCreate: functions.database.ref('/users/{userId}/flights/{flightId}/to')
    .onCreate(computeDistance)
};
