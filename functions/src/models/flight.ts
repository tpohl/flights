export class Flight {
  _id: string;
  name: string;

  date: string;

  flightno: string;
  from: string;
  to: string;

  departureTime: string;
  arrivalTime: string;

  durationMilliseconds: number;

  distance: number;
  aircraftType: string;

  aircraftRegistration: string;
  seat: string;
  seatType: string;
  class: string;

  carrier: string;
  reason: string;
  note: string;
  filekey: string;

  created: Date;
  user: string;

  needsAutocomplete: boolean;
  errorMessage: string;

  lhApiFlight: Flight;
  flightAwareFlight: Flight;
  status: FlightStatus;

}
export type FlightStatus = "guess" | "scheduled" | "landed";
