/**
 * Functions for flight autocompletion.
 */

import { flatMap, tap, map } from 'rxjs/operators';
import { from, of } from "rxjs";
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as jwt from 'jsonwebtoken';
import { RxHR } from "@akanass/rx-http-request";

import flightAutoComplete from './flight-autocomplete.server.service';
import { Flight } from '../models/flight';

const config = functions.config();
const jwtsecret = config.jwt.secret;

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
            return { ...flightInDb, ...flight } as Flight;
          }))
    }))
    .pipe(map(newFlight => {
      newFlight['needsAutocomplete'] = false;
      return newFlight;
    }))
    .pipe(
      flatMap(newFlight => from(flightRef.set(newFlight)).pipe(map(() => newFlight)))
    )
    .pipe(flatMap(flight => {
      console.log('PREPPING');
      const arrival = new Date(flight.arrivalTime);
      if (arrival.getTime() > Date.now()) {
        console.log('Getting Key parts', flightRef.path);
        const flightId = flightRef.key;
        const userId = flightRef.parent.parent.key;
        return prepareFutureAutoCompletion(userId, flightId, arrival)
          .pipe(map(result=>flight));
      } else {
        console.log('Not preparing because the Flight has already landed.');
        return of(flight);
      }
    }))
    .toPromise();
};

const prepareFutureAutoCompletion = function (userId: string, flightId: string, estimatedDate: Date) {
  const autocompletion = {};
  autocompletion['flightId'] = flightId;
  autocompletion['userId'] = userId;
  autocompletion['exp'] = (estimatedDate.getTime() + 60000) / 1000;
  // TODO NotBefore autocompletion['nbf'] = (estimatedDate.getTime() + 60000) / 1000;
  console.log('Payload', autocompletion);
  const token = jwt.sign(autocompletion, jwtsecret);
  console.log('JWT signed', token);
  // TODO call callmelater and POST the token

  const url = 'https://callmelater.pohl.rocks/tasks'

  // Schedule this task
  const task = {
    "url": "https://flights-159420.firebaseapp.com/autocomplete",
    "payload": token,
    "scheduled_date": (Math.max(estimatedDate.getTime(), Date.now()) + 60000)
  }

  return RxHR.post(url, {
    body: task,
    json: true
  }).pipe(tap(response => {
    console.log('Response from callmelater', response);
  }));
}

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

  }),
}
