/**
 * Functions for flight autocompletion.
 */

import { flatMap, tap, map } from 'rxjs/operators';
import { from, of } from "rxjs";
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

import flightAutoComplete from './flight-autocomplete.server.service';



const autocomplete = function (snapshot: functions.database.DataSnapshot, context: functions.EventContext) {
  const flightNo = snapshot.val();
  console.log('BBB');
  return from(
    snapshot.ref.parent.child('date').once('value')
  )
    .pipe(map(dateSnap => dateSnap.val()))
    .pipe(flatMap((dateStr) =>
      flightAutoComplete.autocomplete(flightNo, dateStr)
    ))
    .pipe(tap(flight => console.log('Autocompleted Flight', flight)))
    .pipe(
      flatMap(flight => from(snapshot.ref.parent.once('value'))
        .pipe(map(snap => snap.val()))
        .pipe(map(flightInDb => {
          console.log('Merging flights', flightInDb, flight)
          return { ...flightInDb, ...flight };
        }))
      ))
    .pipe(
      flatMap(newFlight => from(snapshot.ref.parent.set(newFlight)))
    ).toPromise();
};

const autocompleteFlight = function (flightRef: admin.database.Reference, context: functions.EventContext) {

  return from(
    flightRef.once('value'))
    .pipe(map(dateSnap => dateSnap.val()))
    .pipe(flatMap(flightInDb => {
      const flightNo: string = flightInDb['flightno'];
      const dateStr: string = flightInDb['date'];
      console.log('About to autocomplete flight:', flightInDb, flightNo, dateStr)
      return flightAutoComplete.autocomplete(flightNo, dateStr)
        .pipe(tap(flight => console.log('Autocompleted Flight', flight)))
        .pipe(
          map(flight => {
            console.log('Merging flights', flightInDb, flight)
            return { ...flightInDb, ...flight };
          }))
    }))
    .pipe(map(newFlight => {
      newFlight['needsAutocomplete']=false;
      return newFlight;
    }))
    .pipe(
      flatMap(newFlight => from(flightRef.set(newFlight)))
    ).toPromise();
};

export default {
  flightAutoComplete: functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
    .onUpdate((change, context) => {
      return autocompleteFlight(change.after.ref.parent, context);
    }),


  flightAutoCompleteOnCreate: functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
    .onCreate((snapshot, context) => {
      return autocompleteFlight(snapshot.ref.parent, context);
    }),

    flightAutoCompleteRequested: functions.database.ref('/users/{userId}/flights/{flightId}/needsAutocomplete')
    .onUpdate((change, context) => {
      if (change.after.val() ) {
        console.log('Autocompletion Triggered');
        return autocompleteFlight(change.after.ref.parent, context);
      } else {
         return of(true).toPromise();
      }
     
    }),
}
