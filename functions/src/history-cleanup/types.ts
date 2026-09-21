export type JsonObject = Record<string, unknown>;

export interface AirportRecord {
  code?: string;
  timezoneId?: string;
  latitude?: number;
  longitude?: number;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
  reason: string;
  evidence: JsonObject;
  confidence: "high";
}

export interface ReviewFinding {
  category: string;
  message: string;
  firebaseKey?: string;
  fields?: string[];
  evidence?: JsonObject;
}

export interface FlightProposal {
  firebaseKey: string;
  changes: FieldChange[];
}

export interface CleanupArtifact {
  version: string;
  generatedAt: string;
  sources: {
    flights: string;
    airports: string;
    fingerprint: {
      algorithm: "sha256";
      flights: string;
      airports: string;
      combined: string;
    };
  };
  summary: {
    totalFlights: number;
    activeFlights: number;
    deletedFlights: number;
    flightsWithChanges: number;
    proposedFieldChanges: number;
    reviewFindings: number;
    integrityWarnings: number;
    legacyIdsDifferentFromFirebaseKeys: number;
    changesByField: Record<string, number>;
    findingsByCategory: Record<string, number>;
  };
  proposedChanges: FlightProposal[];
  reviewOnlyFindings: ReviewFinding[];
  integrityWarnings: ReviewFinding[];
  forwardUpdates: Record<string, unknown>;
  rollbackUpdates: Record<string, unknown>;
}
