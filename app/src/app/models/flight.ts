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

  validatedAnomaly!: boolean;
  tripId?: string;

  _objectReference!: string;
  _deleted!: boolean;
}

export interface ClassInfo {
  key: string;
  short: string;
  long: string;
  cssClass: string;
}

export const TRAVEL_CLASSES: Map<string, ClassInfo> = new Map(Object.entries({
  Y: { key: 'Y', short: 'ECO', long: 'Economy', cssClass: 'class-y' },
  M: { key: 'M', short: 'ECO+', long: 'Premium Economy', cssClass: 'class-m' },
  C: { key: 'C', short: 'BIZ', long: 'Business', cssClass: 'class-c' },
  F: { key: 'F', short: '1ST', long: 'First Class', cssClass: 'class-f' },
  J: { key: 'J', short: 'JMP', long: 'Jump Seat', cssClass: 'class-j' },
  P: { key: 'P', short: 'CPIT', long: 'Cockpit', cssClass: 'class-p' }
}));
