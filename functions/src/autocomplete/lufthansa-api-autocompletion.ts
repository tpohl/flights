'use strict';

import { Flight } from '../models/flight';
import { RxHR } from '@akanass/rx-http-request';
import * as moment from 'moment';
import { defaultIfEmpty, filter, flatMap, map, mergeMap, tap } from 'rxjs/operators';
import { from, Observable } from 'rxjs';
import { ClientCredentials, AccessToken, ModuleOptions } from 'simple-oauth2';

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

const lhApiTypeReplacements = {
  '32V': 'Airbus A320neo',
  '31D': 'Airbus A319',
  '34Q': 'Airbus A340-300'
};
const replaceType = function (lhApiType) {
  const replacement = lhApiTypeReplacements[lhApiType];
  if (replacement) {
    return replacement;
  } else {
    return lhApiType;
  }
};

/* Types
{
    "AircraftResource": {
        "AircraftSummaries": {
            "AircraftSummary": {
                "AircraftCode": "32N",
                "Names": {
                    "Name": {
                        "@LanguageCode": "EN",
                        "$": "Airbus A320neo"
                    }
                },
                "AirlineEquipCode": "A20N"
            }
        },
        "Meta": {
            "@Version": "1.0.0",
            "Link": {
                "@Href": "https://api.lufthansa.com/v1/mds-references/aircraft/32N?limit=20&offset=0",
                "@Rel": "self"
            }
        }
    }
}
 */


const loadAircraftType = function (acTypeCode, aircraftType) {

  return getLhApiToken()
    .pipe(map(apiTokenObj => apiTokenObj.token.access_token))
    .pipe(flatMap(apiToken =>

      RxHR.get('https://api.lufthansa.com/v1/mds-references/aircraft/' + acTypeCode,
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
          filter(data => data.response.statusCode == 200),
          map(data => data.body),
          map(apiResponse => apiResponse.AircraftResource.AircraftSummaries.AircraftSummary.Names.Name.$),
          map(replaceType),
          defaultIfEmpty((!!aircraftType && aircraftType!= "") ? aircraftType : acTypeCode),
          tap(replacedType => console.log('Replaced AC Type', acTypeCode, replacedType))
        )
    ));

};


const toFlight = function (lhApiFlight: any): Flight {
  const flight = new Flight();
  flight.lhApiFlight = lhApiFlight;
  if (!!lhApiFlight.Departure && !!lhApiFlight.Arrival) {

    flight.from = lhApiFlight.Departure.AirportCode;
    if (lhApiFlight.Departure.ActualTimeUTC) {
      flight.departureTime = lhApiFlight.Departure.ActualTimeUTC.DateTime;
    } else {
      flight.departureTime = lhApiFlight.Departure.ScheduledTimeUTC.DateTime;
    }
    flight.to = lhApiFlight.Arrival.AirportCode;
    if (lhApiFlight.Arrival.ActualTimeUTC) {
      flight.arrivalTime = lhApiFlight.Arrival.ActualTimeUTC.DateTime;
    } else {
      flight.arrivalTime = lhApiFlight.Arrival.ScheduledTimeUTC.DateTime;
    }
    flight.aircraftTypeCode = lhApiFlight.Equipment.AircraftCode;
  } else {
    console.log('LH API FLight is invalid', lhApiFlight);
  }
  return flight;
};

const autocomplete = function (flightNo, dateStr: string): Observable<Flight> {
  // Default to current Date.
  const date = dateStr ? dateStr : moment().format('YYYY-MM-DD');

  console.log('Autocomplete Flight', flightNo, date);


  const flight$: Observable<Flight> = getLhApiToken()
    .pipe(
      map(apiTokenObj => apiTokenObj.token.access_token),
      flatMap(apiToken =>
        RxHR.get('https://api.lufthansa.com/v1/operations/flightstatus/' + flightNo + '/' + date,
          {
            headers: {
              'User-Agent': 'request',
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + apiToken
            },
            json: true
          })
      ),
      tap(data => console.log('Status from LH API', data.response.statusCode)),
      filter(data => data.response.statusCode == 200),
      map(data => data.body)
    ).pipe(
      tap(body => console.log('Body from LH API', body)),
      map(apiResponse => apiResponse.FlightStatusResource.Flights.Flight),
      // The Flights are now an array but maybe not always.
      map(apiResponse => Array.isArray(apiResponse) ? apiResponse[0] : apiResponse),
      tap(body => console.log('Flight from LH API', body)),
      map(toFlight),
      //flatMap(addDistance),
      mergeMap((flight) => loadAircraftType(flight.aircraftTypeCode, flight.aircraftType)
        .pipe(map(acType => {
          flight.aircraftType = acType;
          return flight as Flight;
        }))
      ),
      tap(body => console.log('Complete Flight after autocompletion', body)),
      defaultIfEmpty(new Flight())
    ) as Observable<Flight>;

  return flight$;
};

const FlightAutoCompleter = {

  loadAircraftType : loadAircraftType,
  autocomplete: autocomplete
};


export default FlightAutoCompleter;
