const Client = require('node-rest-client').Client;
const moment = require('moment');
import config from '../config/environment';


// REQUEST kann auf AUTH .auth('username', 'password', false)

var fxmlUrl = 'https://flightxml.flightaware.com/json/FlightXML3/'

var client_options = {
  user: config.flightaware.username,
  password: config.flightaware.apiKey
};
var client = new Client(client_options);

//client.registerMethod('findFlights', fxmlUrl + 'FindFlight', 'GET');
client.registerMethod('flightStatus', fxmlUrl + 'FlightInfoStatus', 'GET');

//client.registerMethod('weatherConditions', fxmlUrl + 'WeatherConditions', 'GET');

const dateregex = /^(\d{4})-(\d{2})-(\d{2})$/g;
var cleanDate = function (date) {

  if (dateregex.test(date)) {
    const subst = `"$3.$2.$1");`;

    // The substituted value will be contained in the result variable
    return date.replace(dateregex, subst);
  } else {
    return date;
  }


}

var findFlightDetails = function (flightNo, flightDate) {
  var promise = new Promise(function (resolve, reject) {
    if (!flightDate) {
      flightDate = moment().format('DD.MM.YYYY');
    } else {
      flightDate = cleanDate(flightDate);
    }

    client.methods.flightStatus({
      parameters: {
        ident: flightNo,
        howMany: 100
      }
    }, function (data, response) {
      if (data.FlightInfoStatusResult && data.FlightInfoStatusResult.flights) {
        var flights = data.FlightInfoStatusResult.flights.filter((flight) => flight.filed_departure_time && flight.filed_departure_time.date == flightDate);

        if (flights.length) {
          var flight = flights[0];
          //console.log('FLIGHT', flight);
          var result = {
            flightno: flight.flightnumber,
            aircraftType: flight.full_aircrafttype,
            carrier: flight.airline,
            from: flight.origin.alternate_ident,
            to: flight.destination.alternate_ident,
            departureTime: flight.estimated_departure_time.epoch,
            arrivalTime: flight.estimated_arrival_time.epoch,
            aircraftRegistration: flight.tailnumber,
            distance: Math.round(flight.distance_filed * 1.60934), // Kilometers
            faFlightID: flight.faFlightID
          }

          //console.log('RESULT', result);

          resolve(result);
        }

      } else {
        reject("Flight not found.");
      }
    });
  });
  return promise;
}

exports.findFlightDetails = findFlightDetails;
