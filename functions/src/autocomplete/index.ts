/**
 * Functions for flight autocompletion.
 */

import { catchError } from "rxjs/operators";
import { firstValueFrom, of, zip } from "rxjs";
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as jwt from "jsonwebtoken";

import { Flight } from "../models/flight";
import loadFlight from "../util/loadFlight";
import defaultTimes from "../util/defaulttime";
import saveFlightAndReturnIt from "../util/saveFlight";
import prepareFutureAutoCompletion from "../util/prepareFutureAutoCompletion";
import FlightAwareAutoCompleter from "./flightaware-autocompletion";
import lufthansaApiAutocompletion from "./lufthansa-api-autocompletion";
import { loadAeroApiFlight, loadAeroApiTrack, loadOperator } from "./aero-api/loadFlight";
import { isWithinXDaysAgo } from "../util/checkDates";

const jwtsecret = process.env.JWT_SECRET;

export const autocompleteFlight = async (flightRef: admin.database.Reference, _context?: functions.EventContext) => {
  const flightInDb = await firstValueFrom(loadFlight(flightRef));
  if (!flightInDb) return;

  const flightNo: string = flightInDb["flightno"];
  const dateStr: string = flightInDb["date"];
  console.log("About to autocomplete flight:", flightInDb, flightNo, dateStr);

  let flight: Flight;
  try {
    const [lhApiFlight, flightAwareFlight] = await firstValueFrom(
      zip([
        lufthansaApiAutocompletion.autocomplete(flightNo, dateStr).pipe(catchError(() => of({}))),
        FlightAwareAutoCompleter.autocomplete(flightNo, dateStr).pipe(catchError(() => of({}))),
      ])
    );

    console.log("Autocompleted Flight Data", { lhApiFlight, flightAwareFlight });
    flight = { ...flightInDb };
    if (flightAwareFlight && Object.keys(flightAwareFlight).length > 0) {
      flight = { ...flight, ...flightAwareFlight };
    }
    flight = { ...flight, ...lhApiFlight };
    flight = defaultTimes(flight);
  } catch (error) {
    console.error("Error during Autocompletion", error);
    flight = { ...flightInDb };
    flight.note = flight.errorMessage ? flight.errorMessage + "\nCould not autocomplete." : "Could not autocomplete.";
  }

  // Carrier icao
  if (flight.flightno && flight.flightno.length > 2) {
    const iata = flight.flightno.substring(0, 2);
    flight.cleanFlightNo = flight.flightno.substring(2);
    try {
      const operator = await firstValueFrom(loadOperator(iata));
      if (operator) {
        flight.icaoCarrier = operator.icao;
      }
    } catch (err) {
      console.warn("Problem loading operator", err);
    }
  }

  // AeroAPI
  if (flight.icaoCarrier && flight.cleanFlightNo && isWithinXDaysAgo(9, flight.date)) {
    try {
      const aeroApiFlight = await firstValueFrom(loadAeroApiFlight(flight.icaoCarrier, flight.cleanFlightNo, flight.date));
      if (aeroApiFlight) {
        flight.aeroApiFlight = aeroApiFlight;
        flight.flightAwareFlightId = aeroApiFlight.fa_flight_id;
        const aeroApiTrack = await firstValueFrom(loadAeroApiTrack(aeroApiFlight.fa_flight_id));
        if (aeroApiTrack) {
          if (typeof aeroApiTrack.actual_distance === "number" && aeroApiTrack.actual_distance > 0) {
            flight.flownDistance = aeroApiTrack.actual_distance * 1.60934;
          }
          const aeroApiTrackRef = flightRef.parent.parent.child("aeroApiTracks").child(aeroApiFlight.fa_flight_id);
          await aeroApiTrackRef.set(aeroApiTrack);
        }
      }
    } catch (err) {
      console.error("Problem with AeroAPI", err);
    }
  }

  flight.needsAutocomplete = false;

  // Save
  const savedFlight = await firstValueFrom(saveFlightAndReturnIt(flightRef)(flight));

  // Future autocompletion
  await firstValueFrom(prepareFutureAutoCompletion(flightRef)(savedFlight));
};

export const autocompleteAircraftType = async (flightRef: admin.database.Reference, _context?: functions.EventContext) => {
  const flightInDb = await firstValueFrom(loadFlight(flightRef));
  if (!flightInDb) return;

  try {
    const type = await firstValueFrom(
      lufthansaApiAutocompletion.loadAircraftType(flightInDb.aircraftTypeCode, flightInDb.aircraftType)
    );
    flightInDb.aircraftType = type;
    await firstValueFrom(saveFlightAndReturnIt(flightRef)(flightInDb));
  } catch (error) {
    console.error("Error loading aircraft type", error);
  }
};

export default {
  lufthansaApiAutocompletion: functions.database.ref("/users/{userId}/flights/{flightId}/flightno")
    .onUpdate((change, context) => autocompleteFlight(change.after.ref.parent, context)),

  lufthansaApiAutocompletionOnCreate: functions.database.ref("/users/{userId}/flights/{flightId}/flightno")
    .onCreate((snapshot, context) => autocompleteFlight(snapshot.ref.parent, context)),

  lufthansaApiAutocompletionRequested: functions.database.ref("/users/{userId}/flights/{flightId}/needsAutocomplete")
    .onUpdate((change, context) => {
      if (change.after.val()) {
        console.log("Autocompletion Triggered");
        return autocompleteFlight(change.after.ref.parent, context);
      }
      return null;
    }),

  lufthansaApiAutocompletionRequestedCreate: functions.database.ref("/users/{userId}/flights/{flightId}/needsAutocomplete")
    .onCreate((snapshot, context) => {
      if (snapshot.val()) {
        console.log("Autocompletion Triggered");
        return autocompleteFlight(snapshot.ref.parent, context);
      }
      return null;
    }),

  flightAcTypeCodeUpdated: functions.database.ref("/users/{userId}/flights/{flightId}/aircraftTypeCode")
    .onWrite((change, context) => {
      if (change.after.val()) {
        console.log("AC Type Update Triggered");
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
      console.log(`autocomplete called for ${flightId}`);

      await autocompleteFlight(admin.database().ref(`/users/${userId}/flights/${flightId}`));
      console.log("Autocompleted via HTTP trigger");
      res.status(200).send("OK");
    } catch (error) {
      console.error("HTTP Autocomplete error", error);
      res.status(400).send("NOT OK");
    }
  }),
};
