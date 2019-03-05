import { Flight } from '../models/flight';

const defaultTimes = function(flight: Flight){
  // if arrival and desitnation are empty
  if (flight.departureTime === undefined && flight.date !== undefined) {
    flight.departureTime =  flight.date + 'T12:00:00Z' ;
  }
  if (flight.arrivalTime === undefined && flight.date !== undefined) {
    flight.arrivalTime =  flight.date + 'T13:00:00Z' ;
  }
  return flight;
}
export default defaultTimes;
