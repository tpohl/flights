'use strict';


import { Flight } from '../models/flight';
import { RxHR } from "@akanass/rx-http-request";
import * as moment from 'moment';
import { filter, map, tap, flatMap, defaultIfEmpty, first, take } from "rxjs/operators";
import { from, zip, Observable, of } from "rxjs";

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const config = functions.config();


const credentials = {
  user: config.flightaware.username,
  password: config.flightaware.apikey,
  auth: "Basic " + new Buffer(config.flightaware.username + ":" + config.flightaware.apikey).toString("base64")
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


}

interface FlightAwareFlight {
  filed_departure_time: boolean;
  faFlightID: string;
  distance_filed: number;
  tailnumber: string;
  estimated_arrival_time: any;
  estimated_departure_time: any;
  destination: FlightAwareAirport;
  origin: FlightAwareAirport;
  airline: string;
  full_aircrafttype: string;
  flightnumber: string;
}

interface FlightAwareAirport {

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

const FlightAwareAutoCompleter = {


  autocomplete: function (flightNo, _flightDate) {
    const flightDate = _flightDate ? cleanDate(_flightDate) : moment().format('DD.MM.YYYY');


    return RxHR.get('https://flightxml.flightaware.com/json/FlightXML3/FlightInfoStatus', {
      headers: { "Authorization": credentials.auth },
      qs: {
        ident: flightNo,
        howMany: 100
      }
    })
      .pipe(
        filter(data => data.response.statusCode == 200),
        map(data => data.body),
        map(body => body.FlightInfoStatusResult.flights),
        defaultIfEmpty([]),
        flatMap((flights: Array<FlightAwareFlight>) =>
          from(flights)
            .pipe(
              filter((flight) => flight.filed_departure_time && flight.filed_departure_time['date'] == flightDate),
              take(1),
              map(flight => {
                const f = new Flight();

                f.flightno = flight.flightnumber;
                f.aircraftType = flight.full_aircrafttype;
                f.carrier = flight.airline;
                f.from = flight.origin.alternate_ident;
                f.to = flight.destination.alternate_ident;
                f.departureTime = flight.estimated_departure_time.epoch;
                f.arrivalTime = flight.estimated_arrival_time.epoch;
                f.aircraftRegistration = flight.tailnumber;
                f.distance = Math.round(flight.distance_filed * 1.60934);// Kilometers
                f.note = flight.faFlightID;
                console.log('Flightaware Result:', flight);
                return f;
              }),
              defaultIfEmpty(new Flight()))
        )) as Observable<Flight>;



  }
}


export default FlightAwareAutoCompleter;
