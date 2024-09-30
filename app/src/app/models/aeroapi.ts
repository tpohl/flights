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
  timestamp: string;
  update_type: UpdateType;
}

export enum AltitudeChange {
  C = 'C',
  D = 'D',
  Empty = '-',
}

export enum UpdateType {
  A = 'A',
  X = 'X',
  P = 'P',
  O = 'O',
  Z = 'P',
  M = 'M',
  D = 'D',
  S = 'S'
}