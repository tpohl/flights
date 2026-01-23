/**
 * Functions for flight autocompletion.
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as jwt from 'jsonwebtoken';

import { Flight } from '../models/flight';
import loadFlight from '../util/loadFlight';
import defaultTimes from '../util/defaulttime';
import saveFlightAndReturnIt from '../util/saveFlight';
import prepareFutureAutoCompletion from '../util/prepareFutureAutoCompletion';
import lufthansaApiAutocompletion from './lufthansa-api-autocompletion';
import { loadAeroApiFlight, loadAeroApiTrack, loadOperator } from './aero-api/loadFlight';
import { isWithinXDaysAgo } from '../util/checkDates';

// All available logging functions
const {
  log,
  info,
  debug,
  warn,
  error,
  write
} = require('firebase-functions/logger');

const jwtsecret = process.env.JWT_SECRET;

export const autocompleteFlight = async (flightRef: admin.database.Reference, _context?: functions.EventContext) => {
  const flightInDb = await loadFlight(flightRef);
  if (!flightInDb) {
    return;
  }

  const flightNo: string = flightInDb['flightno'];
  const dateStr: string = flightInDb['date'];
  const flightId = flightInDb['_id'];

  let flight: Flight;
  flight = JSON.parse(JSON.stringify(flightInDb )); // Deep copy

  log('About to autocomplete flight:', flightInDb, flightNo, dateStr, flightId);
  log('Flight From DB', flight);

  try {
    const lhApiFlight = await lufthansaApiAutocompletion.autocomplete(flightNo, dateStr, flight);
    log('Autocompleted LH-Flight Data', lhApiFlight);
    flight = lhApiFlight;
    flight = defaultTimes(flight);
    debug('Flight after LH Autocompletion', flight);
  } catch (error) {
    error('Error during Autocompletion', error);
    flight = JSON.parse(JSON.stringify(flightInDb)); // Deep copy
    flight.note = flight.errorMessage ? flight.errorMessage + '\nCould not autocomplete.' : 'Could not autocomplete.';
  }

  // Carrier icao
  if (flight.flightno && flight.flightno.length > 2) {
    const iata = flight.flightno.substring(0, 2);
    flight.cleanFlightNo = flight.flightno.substring(2);
    try {
      const operator = await loadOperator(iata);
      if (operator) {
        flight.icaoCarrier = operator.icao;
      }
    } catch (err) {
      warn('Problem loading operator', err);
    }
  }

  // AeroAPI
  if (flight.icaoCarrier && flight.cleanFlightNo && isWithinXDaysAgo(9, flight.date)) {
    try {
      const aeroApiFlight = await loadAeroApiFlight(flight.icaoCarrier, flight.cleanFlightNo, flight.date);
      if (aeroApiFlight) {
        flight.aeroApiFlight = aeroApiFlight;
        flight.flightAwareFlightId = aeroApiFlight.fa_flight_id;
        const aeroApiTrack = await loadAeroApiTrack(aeroApiFlight.fa_flight_id);
        if (aeroApiTrack) {
          if (typeof aeroApiTrack.actual_distance === 'number' && aeroApiTrack.actual_distance > 0) {
            flight.flownDistance = aeroApiTrack.actual_distance * 1.60934;
          }
          const aeroApiTrackRef = flightRef.parent.parent.child('aeroApiTracks').child(aeroApiFlight.fa_flight_id);
          await aeroApiTrackRef.set(aeroApiTrack);
        }
      }
    } catch (err) {
      error('Problem with AeroAPI', err);
    }
  } else {
    log(`Skipping AeroAPI load - missing data or too old flight Carrier: ${flight.icaoCarrier} FlightNo: ${flight.cleanFlightNo}. Date Check: ${isWithinXDaysAgo(9, flight.date)} -> ${flight.date}`);
  }

  flight.needsAutocomplete = false;

  log('Autocompleted Flight. About to save', flight);
  // Save
  const savedFlight = await saveFlightAndReturnIt(flightRef, flight);

  // Future autocompletion - deactivated for now
  // await prepareFutureAutoCompletion(flightRef)(savedFlight);
};

export const autocompleteAircraftType = async (flightRef: admin.database.Reference, _context?: functions.EventContext) => {
  const flightInDb = await loadFlight(flightRef);
  if (!flightInDb) {
    return;
  }

  try {
    const type = await lufthansaApiAutocompletion.loadAircraftType(flightInDb.aircraftTypeCode, flightInDb.aircraftType);
    flightInDb.aircraftType = type;
    await saveFlightAndReturnIt(flightRef, flightInDb);
  } catch (error) {
    error('Error loading aircraft type', error);
  }
};

export default {
  lufthansaApiAutocompletion: functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
    .onUpdate((change, context) => autocompleteFlight(change.after.ref.parent, context)),

  lufthansaApiAutocompletionOnCreate: functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
    .onCreate((snapshot, context) => autocompleteFlight(snapshot.ref.parent, context)),

  autocompletionRequested: functions.database.ref('/users/{userId}/flights/{flightId}/needsAutocomplete')
    .onUpdate((change, context) => {
      if (change.after.val()) {
        log('Autocompletion Triggered');
        return autocompleteFlight(change.after.ref.parent, context);
      }
      return null;
    }),

  autocompletionRequestedCreate: functions.database.ref('/users/{userId}/flights/{flightId}/needsAutocomplete')
    .onCreate((snapshot, context) => {
      if (snapshot.val()) {
        log('Autocompletion Triggered');
        return autocompleteFlight(snapshot.ref.parent, context);
      }
      return null;
    }),

  flightAcTypeCodeUpdated: functions.database.ref('/users/{userId}/flights/{flightId}/aircraftTypeCode')
    .onWrite((change, context) => {
      if (change.after.val()) {
        log('AC Type Update Triggered');
        return autocompleteAircraftType(change.after.ref.parent, context);
      }
      return null;
    }),

  autocomplete: functions.https.onRequest(async (req, res) => {
    const taskJwt = req.body;
    try {
      const autocompletion = jwt.verify(taskJwt, jwtsecret) as any;
      const userId = autocompletion.userId;
      const flightId = autocompletion.flightId;
      log(`autocomplete called for ${flightId}`);

      await autocompleteFlight(admin.database().ref(`/users/${userId}/flights/${flightId}`));
      log('Autocompleted via HTTP trigger');
      res.status(200).send('OK');
    } catch (error) {
      error('HTTP Autocomplete error', error);
      res.status(400).send('NOT OK');
    }
  }),
};
