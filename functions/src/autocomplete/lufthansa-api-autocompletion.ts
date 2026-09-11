import { Flight } from "../models/flight";
import { AccessToken, ClientCredentials } from "simple-oauth2";
import { LhAircraftResponse, LhFlightStatusResponse } from "./lufthansa-api/models";
import { replaceType, toFlight } from "./lufthansa-api/transformers";

import { defineJsonSecret } from "firebase-functions/params";
// All available logging functions
import { log, error } from "firebase-functions/logger";

const config = defineJsonSecret("FLIGHTS_CONFIG");


// Declare fetch for Node 20+ native fetch support
declare const fetch: typeof globalThis.fetch;


let token: AccessToken;


const getLhApiToken = async function(): Promise<AccessToken> {
  if (!token || token.expired()) {
    log("Refreshing LH-API token ...");

    // Access secret values at runtime, not at module load time
    const clientId = config.value().lhapi.clientid as string;
    const clientSecret = config.value().lhapi.clientsecret as string;

    const oauth2 = new ClientCredentials({
      client: {
        id: clientId,
        secret: clientSecret,
      },
      auth: {
        tokenHost: "https://api.lufthansa.com/v1",
        tokenPath: "/v1/oauth/token",
      },
      http: { timeout: 15000 },
    });
    try {
      token = await oauth2.getToken({});
      return token;
    } catch (err) {
      log("Access Token Error", err);
      throw err;
    }
  } else {
    return token;
  }
};


const loadAircraftType = async function(acTypeCode: string, _aircraftType: string): Promise<string> {
  try {
    if (!acTypeCode) {
      throw new Error("No aircraft type code supplied.");
    }
    const apiTokenObj = await getLhApiToken();
    const apiToken = (apiTokenObj.token as any).access_token;

    const response = await fetch(`https://api.lufthansa.com/v1/mds-references/aircraft/${acTypeCode}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "request",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json() as LhAircraftResponse;
      const aircraftName = data.AircraftResource.AircraftSummaries.AircraftSummary.Names.Name.$;
      if (!aircraftName) {
        throw new Error("Lufthansa returned no aircraft type name.");
      }
      const replacedType = replaceType(aircraftName);
      log("Replaced AC Type", acTypeCode, replacedType);
      return replacedType;
    }

    throw new Error(`Lufthansa aircraft lookup failed (HTTP ${response.status}).`);
  } catch (err) {
    error("Error fetching aircraft type", err);
    throw err;
  }
};


const autocomplete = async function(flightNo: string, dateStr: string, existingFlight: Flight): Promise<Flight> {
  const date = dateStr;

  log("Autocomplete Flight", flightNo, date);

  try {
    if (!flightNo || !date) {
      throw new Error("Flight number and date are required for autocompletion.");
    }
    const apiTokenObj = await getLhApiToken();
    const apiToken = (apiTokenObj.token as any).access_token;

    const response = await fetch(`https://api.lufthansa.com/v1/operations/flightstatus/${flightNo}/${date}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "request",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Lufthansa flight lookup failed (HTTP ${response.status}).`);
    }

    const data = await response.json() as LhFlightStatusResponse;
    const flightData = data.FlightStatusResource.Flights.Flight;
    const apiResponse = Array.isArray(flightData) ? flightData[0] : flightData;
    const flight = toFlight(apiResponse, existingFlight);

    // Load aircraft type
    if (flight.aircraftTypeCode && flight.manualOverrides?.aircraftType !== true) {
      flight.aircraftType = await loadAircraftType(flight.aircraftTypeCode, flight.aircraftType);
    }

    return flight as Flight;
  } catch (err) {
    error("Error in LH autocomplete", err);
    throw err;
  }
};

const FlightAutoCompleter = {
  loadAircraftType: loadAircraftType,
  autocomplete: autocomplete,
};


export default FlightAutoCompleter;
