'use strict';

import { Airport } from './../models/airport';
import { Flight } from './../models/flight';
import { RxHR } from "@akanass/rx-http-request";
import * as moment from 'moment';
import { filter, map, tap, flatMap } from "rxjs/operators";
import { from, zip, Observable } from "rxjs";
import * as simpleoauth2 from 'simple-oauth2';
import { DataSnapshot } from '../../node_modules/firebase-functions/lib/providers/database';
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
    tokenPath: '/v1/oauth/token',
    authorizePath: '/v1/oauth/token'
  }
};


const tokenConfig = {};
let token: simpleoauth2.AccessToken;
const oauth2 = simpleoauth2.create(credentials);

const getLhApiToken = function () {
  const promise = new Promise<simpleoauth2.AccessToken>(function (resolve, reject) {
    if (!token || token.expired()) {
      console.log('Refreshing token with credentials', credentials);
      oauth2.clientCredentials.getToken(tokenConfig, function (error, result) {
        if (error) {
          reject(error);
          console.log('Access Token Error', error);
        }
        const newToken = result;
        token = oauth2.accessToken.create(newToken);
        resolve(token);
      });
    }
    else {
      resolve(token);
    }
  }
  );
  return from(promise);
};

const lhApiTypeReplacements = {
  '32V': 'Airbus A 320neo',
};
const replaceType = function (lhApiType) {
  const replacement = lhApiTypeReplacements[lhApiType];
  if (replacement) {
    return replacement;
  } else {
    return lhApiType;
  }
};


const loadAircraftType = function (acTypeCode) {

  return getLhApiToken()
    .pipe(map(apiTokenObj => apiTokenObj.token.access_token))
    .pipe(flatMap(apiToken =>

      RxHR.get('https://api.lufthansa.com/v1/references/aircraft/' + acTypeCode,
        {
          headers: {
            'User-Agent': 'request',
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + apiToken
          },
          json: true
        })
        .pipe(map(data => data.body))
        .pipe(map(apiResponse => apiResponse.AircraftResource.AircraftSummaries.AircraftSummary.Names.Name.$))
        .pipe(map(replaceType))
    ));

};


const toFlight = function (lhApiFlight: any, index) {
  const flight = new Flight();
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
  flight.aircraftType = lhApiFlight.Equipment.AircraftCode;
  return flight;
}

const calculateDistance = function (lat1: number, long1: number, lat2: number, long2: number) {
  const p = 0.017453292519943295;    // Math.PI / 180
  const c = Math.cos;
  const a = 0.5 - c((lat1 - lat2) * p) / 2 + c(lat2 * p) * c((lat1) * p) * (1 - c(((long1 - long2) * p))) / 2;
  const dis = Math.round((12742 * Math.asin(Math.sqrt(a)))); // 2 * R; R = 6371 km
  return dis;
}
const addDistance = function (flight: Flight) {
  console.log('Adding Distance', flight);
  const fromAirport$ = from(admin.database().ref('/airports/' + flight.from).once('value')) as Observable<DataSnapshot>;
  const toAirport$ = from(admin.database().ref('/airports/' + flight.to).once('value')) as Observable<DataSnapshot>;

  return zip(fromAirport$, toAirport$)
    .pipe(map(ap => {
      const ap1 = ap[0].val() as Airport;
      const ap2 = ap[1].val() as Airport;
      flight.distance = calculateDistance(ap1.latitude, ap1.longitude, ap2.latitude, ap2.longitude);
      return flight;
    }));

}

const FlightAutoCompleter = {
  autocomplete: function (flightNo, dateStr: string) {
    // Default to current Date.
    const date = dateStr ? dateStr : moment().format('YYYY-MM-DD');

    console.log('Autocomplete Flight', flightNo, date);


    const flight$ = getLhApiToken()
      .pipe(map(apiTokenObj => apiTokenObj.token.access_token))
      .pipe(flatMap(apiToken =>
        RxHR.get('https://api.lufthansa.com/v1/operations/flightstatus/' + flightNo + '/' + date,
          {
            headers: {
              'User-Agent': 'request',
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + apiToken
            },
            json: true
          })
      ))
      //.pipe(tap(data => console.log('DATA', data)))
      .pipe(filter(data => data.response.statusCode === 200))
      .pipe(map(data => data.body))
      //.pipe(tap(body => console.log('BODY', body)))
      .pipe(map(apiResponse => apiResponse.FlightStatusResource.Flights.Flight))
      .pipe(tap(console.log))
      .pipe(map(toFlight))
      .pipe(flatMap(addDistance))
      .pipe(flatMap((flight) => loadAircraftType(flight.aircraftType)
        .pipe(map(acType => {
          flight.aircraftType = acType;
          return flight;
        }))
      ))

      ;

    return flight$;
  }
}


export default FlightAutoCompleter;
