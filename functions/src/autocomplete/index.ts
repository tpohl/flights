/**
 * Functions for flight autocompletion.
 */

import { flatMap, tap, map } from 'rxjs/operators';
import { from } from "rxjs";
import * as functions from 'firebase-functions';

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

export default {
  flightAutoComplete: functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
    .onUpdate((change, context) => {
      return autocomplete(change.after, context);
    }),


  flightAutoCompleteOnCreate: functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
    .onCreate(autocomplete)
}
