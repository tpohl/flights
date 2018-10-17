/**
 * Functions for flight autocompletion.
 */

import { flatMap, tap, map } from 'rxjs/operators';
import { from, of } from "rxjs";
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

import flightAutoComplete from './flight-autocomplete.server.service';

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
      newFlight['needsAutocomplete'] = false;
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
      if (change.after.val()) {
        console.log('Autocompletion Triggered');
        return autocompleteFlight(change.after.ref.parent, context);
      } else {
        return of(true).toPromise();
      }
    }),

  flightAutoCompleteRequestedCreate: functions.database.ref('/users/{userId}/flights/{flightId}/needsAutocomplete')
    .onCreate((snapshot, context) => {
      if (snapshot.val()) {
        console.log('Autocompletion Triggered');
        return autocompleteFlight(snapshot.ref.parent, context);
      } else {
        return of(true).toPromise();
      }
    }),

  autocomplete: functions.https.onRequest((req, res) => {

    const userId = req.query.userId;
    const flightId = req.query.flightId;
    console.log('autocomplete called');
    console.log('REF ',`/users/${userId}/flights/${flightId}`);
    autocompleteFlight(
      admin.database().ref(`/users/${userId}/flights/${flightId}`), undefined).then(() => {
        console.log('Autocompleted');
        res.status(200).send('OK').end();
      }, () => {
        console.log('REJECTED');
        res.status(200).send('NOT OK').end();
      });

  }),
}
