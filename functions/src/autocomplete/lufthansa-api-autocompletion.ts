import { Flight } from "../models/flight";
import DayJS from "dayjs";
import { catchError, defaultIfEmpty, filter, map, mergeMap, tap } from "rxjs/operators";
import { from, Observable, of } from "rxjs";
import { AccessToken, ClientCredentials, ModuleOptions } from "simple-oauth2";
import { LhAircraftResponse, LhFlightStatusResponse } from "./lufthansa-api/models";
import { replaceType, toFlight } from "./lufthansa-api/transformers";
import * as functions from "firebase-functions/v1";

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

const getLhApiToken = function () {
  const promise = new Promise<AccessToken>(function (resolve, reject) {
    if (!token || token.expired()) {
      console.log("Refreshing token with credentials", credentials);
      oauth2.getToken({}).then((_token) => {
        token = _token;
        resolve(_token);
      }).catch((error) => {
        reject(error);
        console.log("Access Token Error", error);
      });
    } else {
      resolve(token);
    }
  }
  );
  return from(promise);
};


const loadAircraftType = function (acTypeCode: string, _aircraftType: string) {
  return getLhApiToken()
    .pipe(
      map((apiTokenObj) => (apiTokenObj.token as any).access_token),
      mergeMap(async (apiToken) => {
        try {
          const response = await fetch(`https://api.lufthansa.com/v1/mds-references/aircraft/${acTypeCode}`, {
            headers: {
              "User-Agent": "request",
              "Accept": "application/json",
              "Authorization": `Bearer ${apiToken}`,
            },
          });
          if (response.ok) {
            return await response.json() as LhAircraftResponse;
          }
          return null;
        } catch (error) {
          console.error("Error fetching aircraft type", error);
          return null;
        }
      }),
      filter((data) => !!data),
      map((apiResponse) => apiResponse!.AircraftResource.AircraftSummaries.AircraftSummary.Names.Name.$),
      defaultIfEmpty(acTypeCode),
      map(replaceType),
      defaultIfEmpty(acTypeCode),
      tap((replacedType) => console.log("Replaced AC Type", acTypeCode, replacedType))
    );
};


const autocomplete = function (flightNo: string, dateStr: string): Observable<Flight> {
  const date = dateStr ? dateStr : DayJS().format("YYYY-MM-DD");

  console.log("Autocomplete Flight", flightNo, date);


  return getLhApiToken()
    .pipe(
      map((apiTokenObj) => (apiTokenObj.token as any).access_token),
      mergeMap(async (apiToken) => {
        try {
          const response = await fetch(`https://api.lufthansa.com/v1/operations/flightstatus/${flightNo}/${date}`, {
            headers: {
              "User-Agent": "request",
              "Accept": "application/json",
              "Authorization": `Bearer ${apiToken}`,
            },
          });
          if (response.ok) {
            return await response.json() as LhFlightStatusResponse;
          }
          return null;
        } catch (error) {
          console.error("Error fetching flight status", error);
          return null;
        }
      }),
      filter((data) => !!data),
      map((apiResponse) => apiResponse!.FlightStatusResource.Flights.Flight),
      map((apiResponse) => Array.isArray(apiResponse) ? apiResponse[0] : apiResponse),
      map(toFlight),
      mergeMap((flight) => loadAircraftType(flight.aircraftTypeCode, flight.aircraftType)
        .pipe(map((acType) => {
          flight.aircraftType = acType;
          return flight as Flight;
        }))
      ),
      catchError((err) => {
        console.error("Error in LH autocomplete", err);
        return of(new Flight());
      }),
      defaultIfEmpty(new Flight())
    ) as Observable<Flight>;
};

const FlightAutoCompleter = {
  loadAircraftType: loadAircraftType,
  autocomplete: autocomplete,
};


export default FlightAutoCompleter;
