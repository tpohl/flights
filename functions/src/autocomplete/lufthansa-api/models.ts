export interface LhFlightStatusResponse {
  FlightStatusResource: LhFlightStatusResource;
}

export interface LhFlightStatusResource {
  Flights: LhFlights;
  Meta: Meta;
}

export interface LhFlights {
  Flight: LhFlight[];
}

export interface LhFlight {
  Departure: LhArrivalOrDeparture;
  Arrival: LhArrivalOrDeparture;
  MarketingCarrier: LhCarrier;
  OperatingCarrier: LhCarrier;
  Equipment?: LhEquipment;
  FlightStatus?: LhStatus;
  ServiceType?: string;
}

export interface LhArrivalOrDeparture {
  AirportCode: string;
  ScheduledTimeLocal: LhDateTime;
  ScheduledTimeUTC: LhDateTime;
  ActualTimeLocal?: LhDateTime;
  ActualTimeUTC?: LhDateTime;
  TimeStatus: LhStatus;
  Terminal: LhTerminal;
}

export interface LhDateTime {
  DateTime: string;
}

export interface LhTerminal {
  Name: string;
  Gate: string;
}

export interface LhStatus {
  Code: string;
  Definition: string;
}

export interface LhEquipment {
  AircraftCode?: string;
  AircraftRegistration?: string;
}

export interface LhCarrier {
  AirlineID: string;
  FlightNumber: string;
}

export interface Meta {
  "@Version": string;
  Link: Link[] | Link;
}

export type Link = {
  "@Href": string;
  "@Rel": string;
}


export interface LhAircraftResponse {
  AircraftResource: LhAircraftResource;
}

export interface LhAircraftResource {
  AircraftSummaries: LhAircraftSummaries;
  Meta: Meta;
}

export interface LhAircraftSummaries {
  AircraftSummary: LhAircraftSummary;
}

export interface LhAircraftSummary {
  AircraftCode: string;
  Names: LhNames;
  AirlineEquipCode: string;
}

export interface LhNames {
  Name: LhName;
}

export interface LhName {
  "@LanguageCode": string;
  $: string;
}


