export interface AeroAPIIdentResponse {
    flights: AeroApiFlight[];
    links: null;
    num_pages: number;
}

export interface AeroApiFlight {
    ident: string;
    ident_icao: string;
    ident_iata: string;
    actual_runway_off: string;
    actual_runway_on: string;
    fa_flight_id: string;
    operator: string;
    operator_icao: string;
    operator_iata: string;
    flight_number: string;
    registration: string;
    atc_ident: string;
    inbound_fa_flight_id: string;
    codeshares: string[];
    codeshares_iata: string[];
    blocked: boolean;
    diverted: boolean;
    cancelled: boolean;
    position_only: boolean;
    origin: Destination;
    destination: Destination;
    departure_delay: number;
    arrival_delay: number;
    filed_ete: number;
    foresight_predictions_available: boolean;
    scheduled_out: Date;
    estimated_out: Date;
    actual_out: Date;
    scheduled_off: Date;
    estimated_off: Date;
    actual_off: Date;
    scheduled_on: Date;
    estimated_on: Date;
    actual_on: Date;
    scheduled_in: Date;
    estimated_in: Date;
    actual_in: Date;
    progress_percent: number;
    status: string;
    aircraft_type: string;
    route_distance: number;
    filed_airspeed: number;
    filed_altitude: number|null;
    route: null;
    baggage_claim: string;
    seats_cabin_business: number|null;
    seats_cabin_coach: number|null;
    seats_cabin_first: number|null;
    gate_origin: string;
    gate_destination: string|null;
    terminal_origin: string;
    terminal_destination: string;
    type: string;
}

export interface Destination {
    code: string;
    code_icao: string;
    code_iata: string;
    code_lid: null;
    timezone: string;
    name: string;
    city: string;
    airport_info_url: string;
}


export interface AeroAPITrackResponse {
    actual_distance: number;
    positions: Position[];
}

export interface Position {
    fa_flight_id: null;
    altitude: number;
    altitude_change: AltitudeChange;
    groundspeed: number;
    heading: number;
    latitude: number;
    longitude: number;
    timestamp: Date;
    update_type: UpdateType;
}

export enum AltitudeChange {
    C = "C",
    D = "D",
    Empty = "-",
}

export enum UpdateType {
    A = "A",
    X = "X",
}

export interface AeroAPIOperator {
    icao: string;
    iata: string;
    callsign: string;
    name: string;
    country: string;
    location: string;
    phone: string;
    shortname: string;
    url: string;
    wiki_url: string;
    alternatives: any[];
}

