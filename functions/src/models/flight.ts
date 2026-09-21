import { AeroApiFlight } from "../autocomplete/aero-api/models";
import { FlightAwareFlight } from "../autocomplete/flightaware-autocompletion";

export class Flight {
  _id: string;
  _deleted?: boolean;
  name: string;

  date: string;

  flightno: string;
  icaoCarrier: string;
  cleanFlightNo: string;

  from: string;
  to: string;

  departureTime: string;
  arrivalTime: string;
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

  durationMilliseconds: number;

  distance: number;
  plannedDistance?: number;
  flownDistance: number;
  aircraftType?: string|null;
  aircraftTypeCode: string;

  aircraftRegistration?: string;
  seat?: string;
  seatType?: string;
  class: string;

  carrier: string;
  reason: string;
  note: string;
  filekey: string;

  created: Date;
  user: string;

  needsAutocomplete: boolean;
  errorMessage: string;
  manualOverrides?: Partial<Record<FlightManualField, boolean>>;

  lhApiFlight: any;
  flightAwareFlight: FlightAwareFlight;

  aeroApiFlight: AeroApiFlight;
  flightAwareFlightId: string;
  aeroApiEnrichment?: AeroApiEnrichment;
  importMetadata?: FlightImportMetadata;

  status: FlightStatus;
}
export type FlightStatus = "guess" | "scheduled" | "landed";
export type FlightTimeSource = "manual" | "actual" | "estimated" | "scheduled" | "unknown";
export type AeroApiEnrichmentState =
  "scheduled" | "partial" | "final" | "ambiguous" | "not_found" |
  "outside_window" | "budget_blocked" | "error";
export interface AeroApiEnrichment {
  state: AeroApiEnrichmentState;
  candidateCount?: number;
  lastAttemptAt: string;
  nextRefreshAt?: string;
  attempts?: number;
  message?: string;
}
export interface FlightImportMetadata {
  source: "myflightradar24";
  sourceKey: string;
  importedAt: string;
  suppressInitialEnrichment?: boolean;
  suppressedCreateEventId?: string;
}
export type FlightManualField =
  | "from"
  | "to"
  | "departureTime"
  | "arrivalTime"
  | "aircraftTypeCode"
  | "aircraftType"
  | "aircraftRegistration"
  | "carrier"
  | "distance";
