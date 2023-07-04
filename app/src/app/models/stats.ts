import { Flight } from './flight';

export class FlightStats {
  flight: Flight;
  hasAircraft = false;
  aircraft = 'select';
  flightsWithAircraft: Flight[] = [];
  flightsWithType = 0;
  flightsOnRoute = 0;
}

export class OverallStats {
  count = 0;
  distance = 0;
  totalTimeMilliseconds = 0;
}