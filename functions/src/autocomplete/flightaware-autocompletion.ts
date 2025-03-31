'use strict';


import { Flight } from '../models/flight';
import { RxHR } from '@akanass/rx-http-request';
import DayJS from 'dayjs';

import { catchError, defaultIfEmpty, filter, flatMap, map, take, tap } from 'rxjs/operators';
import { concat, from, Observable, of } from 'rxjs';

const functions = require('firebase-functions');
const config = functions.config();


const credentials = {
  user: config.flightaware.username,
  password: config.flightaware.apikey,
  auth: 'Basic ' + new Buffer(config.flightaware.username + ':' + config.flightaware.apikey).toString('base64')
};


const dateregex = /^(\d{4})-(\d{2})-(\d{2})$/g;
const cleanDate = function (date: string) {

  if (dateregex.test(date)) {
    const subst = `"$3.$2.$1");`;

    // The substituted value will be contained in the result variable
    return date.replace(dateregex, subst);
  } else {
    return date;
  }
};
const airlines = new Map(Object.entries({
  'DLH': 'Lufthansa'
}));
const airlineMapper = function (airlineCode: string) {
  return airlines.has(airlineCode) ? airlines.get(airlineCode) : airlineCode;
};

const aircraft = new Map(Object.entries({
  'A319': 'Airbus A319',
  'A320': 'Airbus A320',
  'A321': 'Airbus A321',
  'A359': 'Airbus A350-900',
  'B744': 'Boeing 747-400'
})) as Map<string, string>;

const aircraftMapper = function (acCode: string) {
  return aircraft.has(acCode) ? aircraft.get(acCode) : acCode;
};

export interface FlightAwareFlight {

  faFlightID: string;
  distance_filed: number;
  tailnumber: string;
  estimated_arrival_time?: FlightAwareTimestamp;
  estimated_departure_time?: FlightAwareTimestamp;
  destination: FlightAwareAirport;
  origin: FlightAwareAirport;
  airline: string;
  airline_iata: string;
  full_aircrafttype: string;
  flightnumber: string;
  actual_departure_time?: FlightAwareTimestamp;
  actual_arrival_time?: FlightAwareTimestamp;
  filed_departure_time?: FlightAwareTimestamp;
  filed_arrival_time?: FlightAwareTimestamp;
  progress_percent: number;
}

export interface FlightAwareAirport {

  airport_code: string;
  alternate_ident?: string;
  city: string;
  country_code?: string;
  direction?: string;
  distance?: number;
  elevation?: number;
  heading?: number;
  latitude: number;
  longitude: number;
  name: string;
  state?: string;
  timezone: string;
  wiki_url?: string;
}

export interface FlightAwareTimestamp {
  epoch: number;
}

const FlightAwareAutoCompleter = {


  autocomplete: function (flightNo, _flightDate) {
    // Flightaware does not work at the moment
    return of({});


    const flightDate = _flightDate ? cleanDate(_flightDate) : DayJS().format('DD.MM.YYYY');

    const flightAwareFlightConverter = function (flight: FlightAwareFlight) {
      const f = new Flight();
      f.flightAwareFlight = flight;

      f.flightno = flight.airline_iata + flight.flightnumber;
      f.aircraftType = aircraftMapper(flight.full_aircrafttype);
      f.carrier = airlineMapper(flight.airline);
      f.from = flight.origin.alternate_ident;
      f.to = flight.destination.alternate_ident;

      // Find the best departureTime
      const departureEpoch = flight.actual_departure_time ? flight.actual_departure_time.epoch
        : (flight.estimated_departure_time ? flight.estimated_departure_time.epoch : flight.filed_departure_time.epoch);
      f.departureTime = DayJS.unix(departureEpoch).toISOString();

      // Find the best arrivalTime
      const arrivalEpoch = flight.actual_arrival_time ? flight.actual_arrival_time.epoch
        : (flight.estimated_arrival_time ? flight.estimated_arrival_time.epoch : flight.filed_arrival_time.epoch);
      f.arrivalTime = DayJS.unix(arrivalEpoch).toISOString();

      f.aircraftRegistration = flight.tailnumber;
      if (flight.distance_filed > 0) {
        f.distance = Math.round(flight.distance_filed * 1.60934);// Kilometers
      }
      f.note = flight.faFlightID;
      f.status = flight.progress_percent === 100 ? 'landed' : 'scheduled';
      console.log('Flightaware Result:', flight);
      return f;
    };


    return RxHR.get('https://flightxml.flightaware.com/json/FlightXML3/FlightInfoStatus', {
      headers: { 'Authorization': credentials.auth },
      qs: {
        ident: flightNo,
        howMany: 100
      },
      json: true
    })
      .pipe(
        tap(data => console.log('Status from FlightAware API', data.response.statusCode)),
        filter(data => data.response.statusCode == 200),
        map(data => data.body),
        tap(body => console.log('Body from FlightAware API', body)),
        map(body => {
          const FlightInfoStatusResult = body.FlightInfoStatusResult;
          console.log('FlightInfoStatusResult from FlightAware API', FlightInfoStatusResult);
          const flights = FlightInfoStatusResult ? FlightInfoStatusResult.flights : [];
          console.log('Flights from FlightAware API', flights);
          return flights;
        }),
        defaultIfEmpty([]),
        flatMap((flights: Array<FlightAwareFlight>) =>
          (flights.length === 0) ? of(new Flight()) :
            concat(
              from(flights)
                .pipe(
                  filter((flight, idx) => (
                    flight.filed_departure_time && flight.filed_departure_time['date'] == flightDate) // this is the right flight
                  ),
                  take(1),
                  map(flightAwareFlightConverter),
                  catchError(err => {
                    console.log('Error in FLight Aware Result', err);
                    return of(new Flight());
                  })
                ),
              of(flights[flights.length - 1]).pipe(
                map(flightAwareFlightConverter),
                map(flight => {
                  // This is the last flight. Lets assume on the flight date it is similar.
                  const flightDateMoment = DayJS(flightDate, 'DD.MM.YYYY');
                  const originalDepartureTime = DayJS(flight.departureTime);
                  const originalArrivalTime = DayJS(flight.arrivalTime);
                  const departureTime = originalDepartureTime.clone()
                    .year(flightDateMoment.year())
                    .month(flightDateMoment.month())
                    .date(flightDateMoment.date());
                  const arrivalTime = DayJS.unix(departureTime.unix() + (originalArrivalTime.unix() - originalDepartureTime.unix()));
                  console.log('Flightaware Dates', {
                    date: flightDateMoment,
                    originalDepartureTime: originalDepartureTime,
                    originalArrivalTime: originalArrivalTime,
                    departureTime: departureTime,
                    arrivalTime: arrivalTime,
                    y: flightDateMoment.get('year'),
                    m: flightDateMoment.get('month'),
                    d: flightDateMoment.date()
                  });

                  flight.departureTime =
                    departureTime.toISOString();
                  flight.arrivalTime = arrivalTime.toISOString();

                  delete (flight.aircraftRegistration);

                  console.log('No Flight Found for the day. Guessing Flight: ', flight);

                  flight.status = 'guess';
                  return flight;
                })
              )
            ).pipe(take(1))
        )) as Observable<Flight>;


  }
};


export default FlightAwareAutoCompleter;
