import { AeroApiFlight, AeroAPIIdentResponse, AeroAPIOperator, AeroAPITrackResponse } from "./models";
import * as admin from "firebase-admin";
admin.initializeApp();
// All available logging functions
const {
  log,
  info,
  debug,
  warn,
  error,
  write
} = require('firebase-functions/logger');


const functions = require('firebase-functions');
const { defineJsonSecret } = require('firebase-functions/params');

const config = defineJsonSecret("FLIGHTS_CONFIG");

// Declare fetch for Node 20+ native fetch support
declare const fetch: typeof globalThis.fetch;

export const loadOperator = async function (iata: string): Promise<AeroAPIOperator | null> {
  const ref = admin.database().ref("/operators/" + iata);
  const snapshot = await ref.once("value");

  if (snapshot.exists()) {
    return snapshot.val() as AeroAPIOperator;
  }

  try {
    // Access secret value at runtime, not at module load time
    const AEROAPI_APIKEY = config.value().aeroapi.apikey;

    const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/operators/${iata}`, {
      headers: {
        "Accept": "application/json; charset=UTF-8",
        "x-apikey": AEROAPI_APIKEY,
      },
    });

    if (response.ok) {
      const newOperator = await response.json() as AeroAPIOperator;
      await ref.set(newOperator);
      return newOperator;
    }

    return null;
  } catch (error) {
    error("Error loading operator from AeroAPI", error);
    return null;
  }
};

export const loadAeroApiFlight = async function (carrier: string, flightNo: string, dateStr: string): Promise<AeroApiFlight | null> {
  info(`Loading Aero API Flight ${carrier}${flightNo} on ${dateStr}`);
  try {
    // Access secret value at runtime, not at module load time
    const AEROAPI_APIKEY = config.value().aeroapi.apikey;

    const url = `https://aeroapi.flightaware.com/aeroapi/flights/${carrier}${flightNo}?start=${dateStr}&end=${dateStr}T23:59:59Z`;
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json; charset=UTF-8",
        "x-apikey": AEROAPI_APIKEY,
      },
    });
    if (response.ok) {
      const body = await response.json() as AeroAPIIdentResponse;
      debug(`AeroAPI Response for ${carrier}${flightNo} on ${dateStr}: `, body);
      return body.flights ? body.flights[0] : null;
    } else {
      warn(`AeroAPI Response is not ok: ${carrier}${flightNo} on ${dateStr} -> ${url}`, response);
    }
    return null;
  } catch (error) {
    error("Error loading AeroAPI flight", error);
    return null;
  }
};

export const loadAeroApiTrack = async function (faFlightId: string): Promise<AeroAPITrackResponse | null> {
  try {
    // Access secret value at runtime, not at module load time
    const AEROAPI_APIKEY = config.value().aeroapi.apikey;

    const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${faFlightId}/track?include_estimated_positions=true`, {
      headers: {
        "Accept": "application/json; charset=UTF-8",
        "x-apikey": AEROAPI_APIKEY,
      },
    });
    if (response.ok) {
      return await response.json() as AeroAPITrackResponse;
    }
    return null;
  } catch (error) {
    error("Error loading AeroAPI track", error);
    return null;
  }
};
