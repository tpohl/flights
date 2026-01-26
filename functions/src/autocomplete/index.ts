/**
 * Functions for flight autocompletion.
 */

import * as admin from 'firebase-admin';
import * as jwt from 'jsonwebtoken';
import { onRequest } from 'firebase-functions/v2/https';
import { onValueUpdated, onValueCreated, onValueWritten } from 'firebase-functions/v2/database';
import { defineJsonSecret } from 'firebase-functions/params';
import { log, debug, warn, error } from 'firebase-functions/logger';

import { Flight } from '../models/flight';
import loadFlight from '../util/loadFlight';
import defaultTimes from '../util/defaulttime';
import saveFlightAndReturnIt from '../util/saveFlight';
import lhApiAutocompletion from './lufthansa-api-autocompletion';
import { loadAeroApiFlight, loadAeroApiTrack, loadOperator } from './aero-api/loadFlight';
import { isWithinXDaysAgo } from '../util/checkDates';


const config = defineJsonSecret("FLIGHTS_CONFIG");

export const autocompleteFlight = async (flightRef: admin.database.Reference) => {
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
    const lhApiFlight = await lhApiAutocompletion.autocomplete(flightNo, dateStr, flight);
    log('Autocompleted LH-Flight Data', lhApiFlight);
    flight = lhApiFlight;
    flight = defaultTimes(flight);
    debug('Flight after LH Autocompletion', flight);
  } catch (err) {
    warn('Error during Autocompletion', err);
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
        log('Loaded AeroAPI Flight', aeroApiFlight);
        flight.aeroApiFlight = aeroApiFlight;
        flight.flightAwareFlightId = aeroApiFlight.fa_flight_id;
        const aeroApiTrack = await loadAeroApiTrack(aeroApiFlight.fa_flight_id);
        if (aeroApiTrack) {
          debug('Loaded AeroAPI Track', aeroApiTrack);
          if (typeof aeroApiTrack.actual_distance === 'number' && aeroApiTrack.actual_distance > 0) {
            flight.flownDistance = aeroApiTrack.actual_distance * 1.60934;
          }
          const aeroApiTrackRef = flightRef.parent.parent.child('aeroApiTracks').child(aeroApiFlight.fa_flight_id);
          await aeroApiTrackRef.set(aeroApiTrack);
        } else {
          debug(`No AeroAPI track data for flight ID ${aeroApiFlight.fa_flight_id}`);
        }
      } else {
        debug(`No AeroAPI flight data for ${flight.icaoCarrier}${flight.cleanFlightNo} on ${flight.date}`);
      }
    } catch (err) {
      warn('Problem with AeroAPI', err);
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

export const autocompleteAircraftType = async (flightRef: admin.database.Reference) => {
  const flightInDb = await loadFlight(flightRef);
  if (!flightInDb) {
    return;
  }

  try {
    const type = await lhApiAutocompletion.loadAircraftType(flightInDb.aircraftTypeCode, flightInDb.aircraftType);
    flightInDb.aircraftType = type;
    await saveFlightAndReturnIt(flightRef, flightInDb);
  } catch (err) {
    warn('Error loading aircraft type', err);
  }
};

export const lufthansaApiAutocompletion = onValueUpdated(
  { ref: '/users/{userId}/flights/{flightId}/flightno', secrets: [config] },
  async (event) => {
    return autocompleteFlight(event.data.after.ref.parent!);
  }
);

export const lufthansaApiAutocompletionOnCreate = onValueCreated(
  { ref: '/users/{userId}/flights/{flightId}/flightno', secrets: [config] },
  async (event) => {
    return autocompleteFlight(event.data.ref.parent!);
  }
);

export const autocompletionRequested = onValueUpdated(
  { ref: '/users/{userId}/flights/{flightId}/needsAutocomplete', secrets: [config] },
  async (event) => {
    if (event.data.after.val()) {
      log('Autocompletion Triggered');
      return autocompleteFlight(event.data.after.ref.parent!);
    }
    return null;
  }
);

export const autocompletionRequestedCreate = onValueCreated(
  { ref: '/users/{userId}/flights/{flightId}/needsAutocomplete', secrets: [config] },
  async (event) => {
    if (event.data.val()) {
      log('Autocompletion Triggered');
      return autocompleteFlight(event.data.ref.parent!);
    }
    return null;
  }
);

export const flightAcTypeCodeUpdated = onValueWritten(
  { ref: '/users/{userId}/flights/{flightId}/aircraftTypeCode', secrets: [config] },
  async (event) => {
    if (event.data.after.val()) {
      log('AC Type Update Triggered');
      return autocompleteAircraftType(event.data.after.ref.parent!);
    }
    return null;
  }
);

export const autocomplete = onRequest(
  { secrets: [config] }, // Declare secret dependency
  async (req, res) => {
    // Access secret value at runtime, not at module load time
    const JWTSECRET = config.value().jwt.secret;

    const taskJwt = req.body;
    try {
      const autocompletion = jwt.verify(taskJwt, JWTSECRET) as any;
      const userId = autocompletion.userId;
      const flightId = autocompletion.flightId;
      log(`autocomplete called for ${flightId}`);

      await autocompleteFlight(admin.database().ref(`/users/${userId}/flights/${flightId}`));
      log('Autocompleted via HTTP trigger');
      res.status(200).send('OK');
    } catch (err) {
      warn('HTTP Autocomplete error', err);
      res.status(400).send('NOT OK');
    }
  }
);
