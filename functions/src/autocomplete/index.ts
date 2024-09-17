/**
 * Functions for flight autocompletion.
 */

import { mergeMap, tap, map, catchError, withLatestFrom } from 'rxjs/operators';
import { of, zip } from 'rxjs';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as jwt from 'jsonwebtoken';

import { Flight } from '../models/flight';
import loadFlight from '../util/loadFlight';
import defaultTimes from '../util/defaulttime';
import saveFlightAndReturnIt from '../util/saveFlight';
import prepareFutureAutoCompletion from '../util/prepareFutureAutoCompletion';
import FlightAwareAutoCompleter from './flightaware-autocompletion';
import lufthansaApiAutocompletion from './lufthansa-api-autocompletion';
import { loadAeroApiFlight, loadAeroApiTrack, loadOperator } from './aero-api/loadFlight';
import { isWithinXDaysAgo } from '../util/checkDates';

const config = functions.config();
const jwtsecret = config.jwt.secret;

const autocompleteFlight = function (flightRef: admin.database.Reference, context: functions.EventContext) {
  return loadFlight(flightRef).pipe(
    mergeMap(flightInDb => {
      const flightNo: string = flightInDb['flightno'];
      const dateStr: string = flightInDb['date'];
      console.log('About to autocomplete flight:', flightInDb, flightNo, dateStr);

      return zip(lufthansaApiAutocompletion.autocomplete(flightNo, dateStr), FlightAwareAutoCompleter.autocomplete(flightNo, dateStr))

        .pipe(
          tap(flights => console.log('Autocompleted Flight', flights)),
          map(flights => {
            const lhApiFlight = flights[0];
            const flightAwareFlight = flights[1];
            console.log('Merging flights: DB', flightInDb);
            console.log('Merging flights: Flight Aware', flightAwareFlight);
            console.log('Merging flights: Lufthansa API', lhApiFlight);
            let result = flightInDb;
            if (!!flightAwareFlight && !(Object.keys(flightAwareFlight).length === 0)) {
              result = { ...result, ...flightAwareFlight } as Flight;
              console.log('Result after Flight Aware Merge', result);
            }
            result = { ...result, ...lhApiFlight } as Flight;
            console.log('Result after LH API merge', result);
            return result;
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
    mergeMap(flight => {
      if (!!flight.flightno && flight.flightno.length > 2){
        const iata = flight.flightno.substring(0,2)
        flight.cleanFlightNo = flight.flightno.substring(2)
        return loadOperator(iata).pipe(
          map(operator => {
            flight.icaoCarrier = operator.icao
            return flight;
          })
        )
      } else {
       return of(flight);
      }
    }),
    mergeMap(flight => {
      if (!!flight.icaoCarrier && !! flight.cleanFlightNo && isWithinXDaysAgo(9, flight.date)) {
        return loadAeroApiFlight(flight.icaoCarrier, flight.cleanFlightNo, flight.date)
          .pipe(
            mergeMap(aeroApiFlight => {
              if (!aeroApiFlight){
                console.warn(`No AERO API Flight found for ${flight.icaoCarrier}, ${flight.cleanFlightNo}, ${flight.date}`);
                return of(flight);
              }
              return loadAeroApiTrack(aeroApiFlight.fa_flight_id)
                .pipe(
                  mergeMap(aeroApiTrack => {
                    flight.aeroApiFlight = aeroApiFlight
                    flight.flownDistance = aeroApiTrack.actual_distance * 1.60934;
                    const aeroApiTrackRef = flightRef.parent.parent.child("aeroApiTracks").child(aeroApiFlight.fa_flight_id)
                    return of(aeroApiTrackRef.set(aeroApiTrack))
                      .pipe(map(_=> flight))
                  }))
            })
            , catchError(err => {
              console.error('Problem with AeroAPI', err)
              return of(flight)
            })

          )
      } else {
        return of(flight);
      }
    }),

    map(newFlight => {
      newFlight['needsAutocomplete'] = false;
      return newFlight;
    }),
    mergeMap(saveFlightAndReturnIt(flightRef)),
    mergeMap(prepareFutureAutoCompletion(flightRef))
  )
    .toPromise();
};

const autocompleteAircraftType = function (flightRef: admin.database.Reference, context: functions.EventContext) {

  return loadFlight(flightRef).pipe(
    mergeMap(flightInDb => {
      return lufthansaApiAutocompletion.loadAircraftType(flightInDb.aircraftTypeCode, flightInDb.aircraftType)
        .pipe(
          map(type => {
            flightInDb.aircraftType = type;
            return flightInDb;
          })
        );
    }),
    mergeMap(saveFlightAndReturnIt(flightRef))
  ).toPromise();
};


export default {
  lufthansaApiAutocompletion: functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
    .onUpdate((change, context) => {
      return autocompleteFlight(change.after.ref.parent, context);
    }),


  lufthansaApiAutocompletionOnCreate: functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
    .onCreate((snapshot, context) => {
      return autocompleteFlight(snapshot.ref.parent, context);
    }),

  lufthansaApiAutocompletionRequested: functions.database.ref('/users/{userId}/flights/{flightId}/needsAutocomplete')
    .onUpdate((change, context) => {
      if (change.after.val()) {
        console.log('Autocompletion Triggered');
        return autocompleteFlight(change.after.ref.parent, context);
      } else {
        return of(true).toPromise();
      }
    }),

  lufthansaApiAutocompletionRequestedCreate: functions.database.ref('/users/{userId}/flights/{flightId}/needsAutocomplete')
    .onCreate((snapshot, context) => {
      if (snapshot.val()) {
        console.log('Autocompletion Triggered');
        return autocompleteFlight(snapshot.ref.parent, context);
      } else {
        return of(true).toPromise();
      }
    }),

  flightAcTypeCodeUpdated: functions.database.ref('/users/{userId}/flights/{flightId}/aircraftTypeCode')
    .onWrite((change, context) => {
      if (!!change.after.val()) {
        console.log('AC Type Update Triggered');
        return autocompleteAircraftType(change.after.ref.parent, context);
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
  })
};
