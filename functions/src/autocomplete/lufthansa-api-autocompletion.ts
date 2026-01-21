import { Flight } from "../models/flight";
import DayJS from "dayjs";
import { AccessToken, ClientCredentials, ModuleOptions } from "simple-oauth2";
import { LhAircraftResponse, LhFlightStatusResponse } from "./lufthansa-api/models";
import { replaceType, toFlight } from "./lufthansa-api/transformers";

// All available logging functions
const {
  log,
  info,
  debug,
  warn,
  error,
  write
} = require('firebase-functions/logger');

// Declare fetch for Node 20+ native fetch support
declare const fetch: typeof globalThis.fetch;

const credentials = {
  client: {
    id: process.env.LHAPI_CLIENTID,
    secret: process.env.LHAPI_CLIENTSECRET,
  },
  auth: {
    tokenHost: "https://api.lufthansa.com/v1",
    tokenPath: "/v1/oauth/token",
  },
} as ModuleOptions<"client_id">;


let token: AccessToken;
const oauth2 = new ClientCredentials(credentials);

const getLhApiToken = async function (): Promise<AccessToken> {
  if (!token || token.expired()) {
    log("Refreshing LH-API token ...");
    debug("Refreshing token with credentials", credentials);
    try {
      token = await oauth2.getToken({});
      return token;
    } catch (error) {
      log("Access Token Error", error);
      throw error;
    }
  } else {
    return token;
  }
};


const loadAircraftType = async function (acTypeCode: string, _aircraftType: string): Promise<string> {
  try {
    const apiTokenObj = await getLhApiToken();
    const apiToken = (apiTokenObj.token as any).access_token;

    const response = await fetch(`https://api.lufthansa.com/v1/mds-references/aircraft/${acTypeCode}`, {
      headers: {
        "User-Agent": "request",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json() as LhAircraftResponse;
      const aircraftName = data.AircraftResource.AircraftSummaries.AircraftSummary.Names.Name.$;
      const replacedType = replaceType(aircraftName);
      log("Replaced AC Type", acTypeCode, replacedType);
      return replacedType;
    }

    return acTypeCode;
  } catch (error) {
    error("Error fetching aircraft type", error);
    return acTypeCode;
  }
};


const autocomplete = async function (flightNo: string, dateStr: string, existingFlight: Flight): Promise<Flight> {
  const date = dateStr ? dateStr : DayJS().format("YYYY-MM-DD");

  log("Autocomplete Flight", flightNo, date);

  try {
    const apiTokenObj = await getLhApiToken();
    const apiToken = (apiTokenObj.token as any).access_token;

    const response = await fetch(`https://api.lufthansa.com/v1/operations/flightstatus/${flightNo}/${date}`, {
      headers: {
        "User-Agent": "request",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      return new Flight();
    }

    const data = await response.json() as LhFlightStatusResponse;
    const flightData = data.FlightStatusResource.Flights.Flight;
    const apiResponse = Array.isArray(flightData) ? flightData[0] : flightData;
    const flight = toFlight(apiResponse, existingFlight);

    // Load aircraft type
    const acType = await loadAircraftType(flight.aircraftTypeCode, flight.aircraftType);
    flight.aircraftType = acType || flight.aircraftType;

    return flight as Flight;
  } catch (error) {
    error("Error in LH autocomplete", error);
    return new Flight();
  }
};

const FlightAutoCompleter = {
  loadAircraftType: loadAircraftType,
  autocomplete: autocomplete,
};


export default FlightAutoCompleter;
