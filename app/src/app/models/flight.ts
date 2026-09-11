export class Flight {
  _id!: string | null;
  name!: string;

  date!: string;

  flightno!: string;
  from!: string;
  to!: string;

  departureTime!: string;
  arrivalTime!: string;
  scheduledDepartureTime?: string;
  estimatedDepartureTime?: string;
  actualDepartureTime?: string;
  scheduledTakeoffTime?: string;
  estimatedTakeoffTime?: string;
  actualTakeoffTime?: string;
  scheduledLandingTime?: string;
  estimatedLandingTime?: string;
  actualLandingTime?: string;
  scheduledArrivalTime?: string;
  estimatedArrivalTime?: string;
  actualArrivalTime?: string;
  departureTimeSource?: FlightTimeSource;
  arrivalTimeSource?: FlightTimeSource;

  durationMilliseconds!: number;

  distance!: number;
  plannedDistance?: number;

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
  aeroApiEnrichment?: AeroApiEnrichment;

  manualOverrides?: Partial<Record<FlightManualField, boolean>>;

  validatedAnomaly!: boolean;

  _objectReference!: string;
  _deleted!: boolean;
}

export const FLIGHT_MANUAL_FIELDS = [
  'from', 'to', 'departureTime', 'arrivalTime', 'aircraftTypeCode',
  'aircraftType', 'aircraftRegistration', 'carrier', 'distance'
] as const;

export type FlightManualField = typeof FLIGHT_MANUAL_FIELDS[number];

export type FlightTimeSource = 'manual' | 'actual' | 'estimated' | 'scheduled' | 'unknown';

export type AeroApiEnrichmentState =
  'scheduled' | 'partial' | 'final' | 'ambiguous' | 'not_found' |
  'outside_window' | 'budget_blocked' | 'error';

export interface AeroApiEnrichment {
  state: AeroApiEnrichmentState;
  candidateCount?: number;
  lastAttemptAt: string;
  nextRefreshAt?: string;
  attempts?: number;
  message?: string;
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
