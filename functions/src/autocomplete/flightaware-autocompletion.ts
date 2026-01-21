import { Flight } from "../models/flight";

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
  autocomplete: async function(_flightNo: string, _flightDate: string): Promise<Flight | any> {
    // Flightaware does not work at the moment
    // TODO: Implement FlightAware API integration
    return {};
  },
};

export default FlightAwareAutoCompleter;
