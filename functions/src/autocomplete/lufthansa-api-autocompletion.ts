'use strict';

import { Flight } from '../models/flight';
import { RxHR } from '@akanass/rx-http-request';
import DayJS from 'dayjs';
import { catchError, defaultIfEmpty, filter, map, mergeMap, tap } from 'rxjs/operators';
import { from, Observable, of } from 'rxjs';
import { AccessToken, ClientCredentials, ModuleOptions } from 'simple-oauth2';
import { LhAircraftResponse, LhFlightStatusResponse } from './lufthansa-api/models';
import { replaceType, toFlight } from './lufthansa-api/transformers';

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const config = functions.config();

admin.initializeApp();

const credentials = {
  client: {
    id: config.lhapi.clientid,
    secret: config.lhapi.clientsecret
  },
  auth: {
    tokenHost: 'https://api.lufthansa.com/v1',
    tokenPath: '/v1/oauth/token'
  }
} as ModuleOptions<'client_id'>;


const tokenConfig = {};
let token: AccessToken;
const oauth2 = new ClientCredentials(credentials);

const getLhApiToken = function () {
  const promise = new Promise<AccessToken>(function (resolve, reject) {
      if (!token || token.expired()) {
        console.log('Refreshing token with credentials', credentials);
        oauth2.getToken(tokenConfig).then((_token) => {
          token = _token;
          resolve(_token);
        }).catch(error => {

          reject(error);
          console.log('Access Token Error', error);

        });

      } else {
        resolve(token);
      }
    }
  );
  return from(promise);
};



const loadAircraftType = function (acTypeCode: string, aircraftType: string) {

  return getLhApiToken()
    .pipe(map(apiTokenObj => apiTokenObj.token.access_token))
    .pipe(mergeMap(apiToken =>
      // Fetch the Aircraft Type from the Lufthansa API.
      RxHR.get<LhAircraftResponse>('https://api.lufthansa.com/v1/mds-references/aircraft/' + acTypeCode,
        {
          headers: {
            'User-Agent': 'request',
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + apiToken
          },
          json: true
        })
        .pipe(
          tap(data => console.log('Aircraft Response', data)),
          filter(data => data.response.statusCode === 200),
          map(data => data.body),
          map(apiResponse => apiResponse.AircraftResource.AircraftSummaries.AircraftSummary.Names.Name.$),
          defaultIfEmpty(acTypeCode),
          map(replaceType),
          defaultIfEmpty(acTypeCode),
          tap(replacedType => console.log('Replaced AC Type', acTypeCode, replacedType))
        )
    ));

};


const autocomplete = function (flightNo, dateStr: string): Observable<Flight> {
  // Default to current Date.
  const date = dateStr ? dateStr : DayJS().format('YYYY-MM-DD');

  console.log('Autocomplete Flight', flightNo, date);


  return getLhApiToken()
    .pipe(
      map(apiTokenObj => apiTokenObj.token.access_token),
      mergeMap(apiToken =>
        RxHR.get<LhFlightStatusResponse>('https://api.lufthansa.com/v1/operations/flightstatus/' + flightNo + '/' + date,
          {
            headers: {
              'User-Agent': 'request',
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + apiToken
            },
            json: true
          })
      ),
      //tap(data => console.log('Status from LH API', data.response.statusCode)),
      filter(data => data.response.statusCode === 200),
      map(data => data.body)
    ).pipe(
      //tap(body => console.log('Body from LH API', body)),
      map(apiResponse => apiResponse.FlightStatusResource.Flights.Flight),
      // The Flights are now an array but maybe not always.
      map(apiResponse => Array.isArray(apiResponse) ? apiResponse[0] : apiResponse),
      //tap(body => console.log('Flight from LH API', body)),
      map(toFlight),
      //flatMap(addDistance),
      mergeMap((flight) => loadAircraftType(flight.aircraftTypeCode, flight.aircraftType)
        .pipe(map(acType => {
          flight.aircraftType = acType;
          return flight as Flight;
        }))
      ),
      //tap(body => console.log('Complete Flight after autocompletion', body)),
      defaultIfEmpty(new Flight())
    ) as Observable<Flight>;
};

const FlightAutoCompleter = {
  loadAircraftType: loadAircraftType,
  autocomplete: autocomplete
};


export default FlightAutoCompleter;
