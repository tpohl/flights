export class Flight {
  _id!: string | null;
  name!: string;

  date!: string;

  flightno!: string;
  from!: string;
  to!: string;

  departureTime!: string;
  arrivalTime!: string;

  durationMilliseconds!: number;

  distance!: number;

  aircraftTypeCode!: string;
  aircraftType!: string;

  aircraftRegistration!: string;
  seat!: string;
  seatType!: string;
  class!: string;

  carrier!: string;
  reason!: string;
  note!: string;
  filekey!: string;

  created!: Date;
  user!: string;

  lhApiFlight: any;
  aeroApiFlight: any;

  flightAwareFlightId!: string;

  flownDistance!: number;

  needsAutocomplete!: boolean;
  errorMessage!: string;

  _objectReference!: string;
  _deleted!: boolean;
}
