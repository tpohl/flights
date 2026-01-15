import * as functions from "firebase-functions/v1";

import { AeroApiFlight, AeroAPIIdentResponse, AeroAPIOperator, AeroAPITrackResponse } from "./models";
import { mergeMap, filter } from "rxjs/operators";
import { from, Observable } from "rxjs";

import * as admin from "firebase-admin";

export const loadOperator = function (iata: string): Observable<AeroAPIOperator> {
  const ref = admin.database().ref("/operators/" + iata);
  return from(ref.once("value")).pipe(
    mergeMap(async (snapshot: any) => {
      if (snapshot.exists()) {
        return snapshot.val() as AeroAPIOperator;
      } else {
        try {
          const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/operators/${iata}`, {
            headers: {
              "Accept": "application/json; charset=UTF-8",
              "x-apikey": process.env.AEROAPI_APIKEY,
            },
          });
          if (response.ok) {
            const newOperator = await response.json() as AeroAPIOperator;
            await ref.set(newOperator);
            return newOperator;
          }
          return null;
        } catch (error) {
          console.error("Error loading operator from AeroAPI", error);
          return null;
        }
      }
    }),
    filter((op): op is AeroAPIOperator => !!op)
  );
};

export const loadAeroApiFlight = function (carrier: string, flightNo: string, dateStr: string): Observable<AeroApiFlight> {
  console.info(`Loading Aero API Flight ${carrier}${flightNo} on ${dateStr}`);
  return from((async () => {
    try {
      const url = `https://aeroapi.flightaware.com/aeroapi/flights/${carrier}${flightNo}?start=${dateStr}&end=${dateStr}T23:59:59Z`;
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json; charset=UTF-8",
          "x-apikey": process.env.AEROAPI_APIKEY,
        },
      });
      if (response.ok) {
        const body = await response.json() as AeroAPIIdentResponse;
        return body.flights ? body.flights[0] : null;
      }
      return null;
    } catch (error) {
      console.error("Error loading AeroAPI flight", error);
      return null;
    }
  })()) as Observable<AeroApiFlight>;
};

export const loadAeroApiTrack = function (faFlightId: string): Observable<AeroAPITrackResponse> {
  return from((async () => {
    try {
      const response = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${faFlightId}/track?include_estimated_positions=true`, {
        headers: {
          "Accept": "application/json; charset=UTF-8",
          "x-apikey": process.env.AEROAPI_APIKEY,
        },
      });
      if (response.ok) {
        return await response.json() as AeroAPITrackResponse;
      }
      return null;
    } catch (error) {
      console.error("Error loading AeroAPI track", error);
      return null;
    }
  })()) as Observable<AeroAPITrackResponse>;
};
