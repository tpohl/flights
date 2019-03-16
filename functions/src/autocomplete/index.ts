/**
 * Functions for flight autocompletion.
 */

import { flatMap, tap, map, catchError } from 'rxjs/operators';
import { of } from "rxjs";
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as jwt from 'jsonwebtoken';

import flightAutoComplete from './flight-autocomplete.server.service';
import { Flight } from '../models/flight';
import loadFlight from '../util/loadFlight';
import defaultTimes from '../util/defaulttime';
import saveFlightAndReturnIt from '../util/saveFlight';
import prepareFutureAutoCompletion from '../util/prepareFutureAutoCompletion';

const config = functions.config();
const jwtsecret = config.jwt.secret;

const autocompleteFlight = function (flightRef: admin.database.Reference, context: functions.EventContext) {

  return loadFlight(flightRef).pipe(
    flatMap(flightInDb => {
      const flightNo: string = flightInDb['flightno'];
      const dateStr: string = flightInDb['date'];
      console.log('About to autocomplete flight:', flightInDb, flightNo, dateStr)
      return flightAutoComplete.autocomplete(flightNo, dateStr)
        .pipe(
          tap(flight => console.log('Autocompleted Flight', flight)),

          map(flight => {
            console.log('Merging flights', flightInDb, flight)
            return { ...flightInDb, ...flight } as Flight;
          }),
          map(defaultTimes),
          catchError(
            (error) => {
              console.error('Error during Autocompletion', error);
              return of(flightInDb)
                .pipe(
                  map(flight => {
                    flight['note'] = flight['errorMessage'] ? flight['errorMessage'] + '/nCould not autocomplete.' : 'Could not autocomplete.';
                    return flight;
                  })
                );
            })
        );
    }),
    map(newFlight => {
      newFlight['needsAutocomplete'] = false;
      return newFlight;
    }),
    flatMap(saveFlightAndReturnIt(flightRef)),
    flatMap(prepareFutureAutoCompletion(flightRef))
  )

    .toPromise();
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
    const taskJwt = req.body;
    try {
      const autocompletion = jwt.verify(taskJwt, jwtsecret);

      const userId = autocompletion['userId'];
      const flightId = autocompletion['flightId'];
      console.log('autocomplete called');
      console.log('REF ', `/users/${userId}/flights/${flightId}`);
      autocompleteFlight(
        admin.database().ref(`/users/${userId}/flights/${flightId}`), undefined).then(() => {
          console.log('Autocompleted');
          res.status(200).send('OK').end();
        }, () => {
          console.log('REJECTED');
          res.status(200).send('NOT OK').end();
        });
    } catch (error) {
      console.log(error);
      res.status(400).send('NOT OK').end();
    }
  }),
}
