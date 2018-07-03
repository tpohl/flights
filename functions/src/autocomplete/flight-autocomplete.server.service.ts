'use strict';

import { RxHR } from "@akanass/rx-http-request";
import * as moment from 'moment';
import { filter, map, tap, flatMap } from "rxjs/operators";
import { from } from "rxjs";
import * as simpleoauth2 from 'simple-oauth2';
const functions = require('firebase-functions');
const config = functions.config();


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
let token : simpleoauth2.AccessToken;
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
        console.log('TOKEN', token);
        resolve(token);
      });

    } else {
      console.log('TOKEN', token);
      resolve(token);
    }

  });
  return from(promise);
}

/*
  var promise = new Promise(function (resolve, reject) {
    tokenService.token().then(function (token) {
      var options = {
        url: 'https://api.lufthansa.com/v1/operations/flightstatus/' + flightNo + '/' + date,
        headers: {
          'User-Agent': 'request',
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + token.token.access_token
        }
      };
      console.log('AUTH', options.headers.Authorization);
      request(options,
        function (error, response, body) {
          if (!error && response.statusCode === 200) {
            var apiResponse = JSON.parse(body);
            if (apiResponse.FlightStatusResource.Flights.Flight) {
              var lhApiFlight = apiResponse.FlightStatusResource.Flights.Flight;
              var flight = toFlight(lhApiFlight);
              flight.flightno = flightNo;
              if (flight.aircraftType) {
                exports.loadAircraftType(flight.aircraftType).then(function (acType) {
                  flight.aircraftType = acType;
                  resolve(flight);
                }, function (error) {
                  resolve(flight);
                });
              } else {
                resolve(flight);
              }
            } else {
              reject('Error: No Flight found in lufthansa api.');
            }

          } else {
            console.log("Not found Flight", flightNo, date);
            reject('Error: Flight not found in lufthansa api.');
          }
        });
    }, function (error) {
      console.log('ERROR', error);
    });


  });
  return promise;
  */


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
}
/*
exports.loadAircraftType = function (acTypeCode) {
  var promise = new Promise(function (resolve, reject) {
    tokenService.token().then(function (token) {
      var options = {
        url: 'https://api.lufthansa.com/v1/references/aircraft/' + acTypeCode,
        headers: {
          'User-Agent': 'request',
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + token.token.access_token
        }
      };
      console.log('AUTH', options.headers.Authorization);
      request(options,
        function (error, response, body) {

          if (!error && response.statusCode === 200) {
            var apiResponse = JSON.parse(body);

            if (apiResponse.AircraftResource.AircraftSummaries.AircraftSummary) {
              console.log("Aircraft Info", apiResponse.AircraftResource.AircraftSummaries.AircraftSummary);
              var lhApiType = apiResponse.AircraftResource.AircraftSummaries.AircraftSummary.Names.Name.$;
              var translatedType = replaceType(lhApiType)
              console.log("Aircraft Type Name", lhApiType, translatedType);
              resolve(translatedType);
            } else {
              reject('Error: No Aircraft found in lufthansa api.');
            }

          } else {
            console.log("Not found Aircraft", acTypeCode);
            reject('Error: Aircraft Data not found in lufthansa api.');
          }
        });
    });
  });
  return promise;
};
*/
class Flight {
  from: string;
  to: string;
  aircraftType: string;
  departureTime: Date;
  arrivalTime: Date;
}
const toFlight = function (lhApiFlight: any, index) {
  console.log('TO FLIGHT', lhApiFlight)
  var flight = new Flight();
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

const FlightAutoCompleter = {
  autocomplete: function (flightNo, date = moment().format('YYYY-MM-DD')) {

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
    .pipe(tap(data => console.log('DATA', data)))
      .pipe(filter(data => data.response.statusCode === 200))
      .pipe(map(data => data.body))
      .pipe(tap(body => console.log('BODY', body)))
      .pipe(map(apiResponse => apiResponse.FlightStatusResource.Flights.Flight))
      .pipe(tap(console.log))
      .pipe(map(toFlight))
      ;

    return flight$;
  }
}
export default FlightAutoCompleter;
