import { createHash } from "node:crypto";
import { basename } from "node:path";
import {
  AirportRecord,
  CleanupArtifact,
  FieldChange,
  FlightProposal,
  JsonObject,
  ReviewFinding,
} from "./types";
import { hasExplicitTimezone, localDateInZone, resolveLocalIso } from "./timezone";

const VERSION = "1.0";
const KM_PER_STATUTE_MILE = 1.609344;
const DURATION_CONFLICT_TOLERANCE_MS = 60 * 1000;
const UNSAFE_FIREBASE = /[.#$[\]/]/;

interface CleanupInput {
  flightsSource: { path: string; content: string };
  airportsSource: { path: string; content: string };
  generatedAt?: string;
}

interface Consensus {
  target: string;
  display?: string;
  support: number;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isMissing = (value: unknown) => value === undefined || value === null ||
  (typeof value === "string" && !value.trim());
const usefulString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const normalized = (value: unknown) => usefulString(value)?.toUpperCase().replace(/[\s-]+/g, "");
const normalizedName = (value: unknown) => usefulString(value)?.toLocaleLowerCase("en").replace(/\s+/g, " ");
const finitePositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

const parseJson = (content: string, label: string): unknown => {
  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${label} JSON: ${message}`);
  }
};

const sortedObject = <T>(entries: [string, T][]): Record<string, T> =>
  Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));

const counts = (items: string[]) => sortedObject([...new Set(items)].map((item) =>
  [item, items.filter((candidate) => candidate === item).length]));

const sourceHash = (content: string) => createHash("sha256").update(content).digest("hex");

const airportCode = (value: unknown) => normalized(value);

const airportFor = (airports: Map<string, AirportRecord>, code: unknown) => {
  const key = airportCode(code);
  return key ? airports.get(key) : undefined;
};

const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

const explicitInstant = (value: unknown): number | null =>
  hasExplicitTimezone(value) ? Date.parse(value) : null;

const haversine = (from: AirportRecord, to: AirportRecord): number | null => {
  const coordinates = [from.latitude, from.longitude, to.latitude, to.longitude];
  if (!coordinates.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  if (Math.abs(from.latitude!) > 90 || Math.abs(to.latitude!) > 90 ||
      Math.abs(from.longitude!) > 180 || Math.abs(to.longitude!) > 180) return null;
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((from.latitude! - to.latitude!) * p) / 2 +
    Math.cos(to.latitude! * p) * Math.cos(from.latitude! * p) *
    (1 - Math.cos((from.longitude! - to.longitude!) * p)) / 2;
  return Math.round(12742 * Math.asin(Math.sqrt(a)));
};

const candidateDeparture = (candidate: JsonObject) =>
  usefulString(candidate.scheduled_out) || usefulString(candidate.scheduled_off) ||
  usefulString(candidate.estimated_out) || usefulString(candidate.estimated_off) ||
  usefulString(candidate.actual_out) || usefulString(candidate.actual_off);

const trustedAeroEvidence = (
  flight: JsonObject,
  airports: Map<string, AirportRecord>
): { candidate: JsonObject; trusted: boolean; reason?: string } | null => {
  if (!isObject(flight.aeroApiFlight)) return null;
  const candidate = flight.aeroApiFlight;
  const wanted = normalized(flight.flightno);
  const identifiers = [
    candidate.ident, candidate.ident_iata, candidate.ident_icao,
    ...(Array.isArray(candidate.codeshares) ? candidate.codeshares : []),
    ...(Array.isArray(candidate.codeshares_iata) ? candidate.codeshares_iata : []),
  ].map(normalized).filter(Boolean);
  if (!wanted || !identifiers.includes(wanted)) {
    return { candidate, trusted: false, reason: "Cached AeroAPI identifiers do not match the flight number." };
  }
  const storedFaFlightId = usefulString(flight.flightAwareFlightId);
  const candidateFaFlightId = usefulString(candidate.fa_flight_id);
  if (storedFaFlightId && candidateFaFlightId && storedFaFlightId !== candidateFaFlightId) {
    return { candidate, trusted: false, reason: "Cached AeroAPI flight ID does not match the stored provider flight ID." };
  }
  const origin = isObject(candidate.origin) ? candidate.origin : undefined;
  const destination = isObject(candidate.destination) ? candidate.destination : undefined;
  const originCode = origin && (usefulString(origin.code_iata) || usefulString(origin.code));
  const destinationCode = destination &&
    (usefulString(destination.code_iata) || usefulString(destination.code));
  if (!isMissing(flight.from) && originCode &&
      normalized(flight.from) !== normalized(originCode)) {
    return { candidate, trusted: false, reason: "Cached AeroAPI origin conflicts with the stored flight origin." };
  }
  if (!isMissing(flight.to) && destinationCode &&
      normalized(flight.to) !== normalized(destinationCode)) {
    return { candidate, trusted: false, reason: "Cached AeroAPI destination conflicts with the stored flight destination." };
  }
  const zone = origin && usefulString(origin.timezone) || airportFor(airports, originCode)?.timezoneId;
  const departure = candidateDeparture(candidate);
  const localDate = localDateInZone(departure, zone);
  if (!validDate(flight.date) || localDate !== flight.date) {
    return { candidate, trusted: false, reason: "Cached AeroAPI origin-local departure date does not match the flight date." };
  }
  return { candidate, trusted: true };
};

const consensusIndex = (
  flights: [string, JsonObject][],
  source: (flight: JsonObject) => string | undefined,
  target: (flight: JsonObject) => string | undefined,
  display?: (flight: JsonObject) => string | undefined
): { eligible: Map<string, Consensus>; conflicts: Map<string, Record<string, number>> } => {
  const mappings = new Map<string, Map<string, { keys: Set<string>; spellings: Map<string, number> }>>();
  for (const [key, flight] of flights) {
    const from = source(flight);
    const to = target(flight);
    if (!from || !to) continue;
    const targets = mappings.get(from) || new Map();
    const evidence = targets.get(to) || { keys: new Set<string>(), spellings: new Map<string, number>() };
    evidence.keys.add(key);
    const spelling = display?.(flight);
    if (spelling) evidence.spellings.set(spelling, (evidence.spellings.get(spelling) || 0) + 1);
    targets.set(to, evidence);
    mappings.set(from, targets);
  }
  const eligible = new Map<string, Consensus>();
  const conflicts = new Map<string, Record<string, number>>();
  for (const [from, targets] of mappings) {
    const support = sortedObject([...targets].map(([to, evidence]) => [to, evidence.keys.size]));
    if (targets.size !== 1) {
      conflicts.set(from, support);
      continue;
    }
    const [targetValue, evidence] = [...targets][0];
    if (evidence.keys.size < 2) continue;
    const spelling = [...evidence.spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    eligible.set(from, { target: targetValue, display: spelling, support: evidence.keys.size });
  }
  return { eligible, conflicts };
};

const addFinding = (
  target: ReviewFinding[],
  category: string,
  message: string,
  firebaseKey?: string,
  fields?: string[],
  evidence?: JsonObject
) => target.push({ category, message, ...(firebaseKey ? { firebaseKey } : {}),
  ...(fields?.length ? { fields: [...fields].sort() } : {}), ...(evidence ? { evidence } : {}) });

export const buildCleanupArtifact = (input: CleanupInput): CleanupArtifact => {
  const parsedFlights = parseJson(input.flightsSource.content, "flights export");
  const parsedAirports = parseJson(input.airportsSource.content, "airports export");
  if (!isObject(parsedFlights)) throw new Error("Flights export root must be a JSON object.");
  if (!("flights" in parsedFlights)) throw new Error("Flights export is missing the required \"flights\" root.");
  if (!isObject(parsedFlights.flights)) throw new Error("Flights export \"flights\" root must be an object map.");
  if ("aeroApiTracks" in parsedFlights && !isObject(parsedFlights.aeroApiTracks)) {
    throw new Error("Flights export \"aeroApiTracks\" root must be an object map when present.");
  }
  if (!isObject(parsedAirports)) throw new Error("Airports export root must be an object map.");

  const flightEntries = Object.entries(parsedFlights.flights).sort(([a], [b]) => a.localeCompare(b));
  const airportEntries = Object.entries(parsedAirports).sort(([a], [b]) => a.localeCompare(b));
  const ids = new Map<string, string>();
  const unexpectedIdMismatches: string[] = [];
  let legacyIdsDifferentFromFirebaseKeys = 0;
  for (const [key, value] of flightEntries) {
    if (UNSAFE_FIREBASE.test(key)) throw new Error(`Flight key ${JSON.stringify(key)} contains a Firebase-unsafe character.`);
    if (!isObject(value)) throw new Error(`Flight ${JSON.stringify(key)} must be an object; active records cannot be skipped.`);
    const id = usefulString(value._id);
    if (id) {
      const previous = ids.get(id);
      if (previous && previous !== key) {
        throw new Error(
          `Duplicate flight _id ${JSON.stringify(id)} appears under keys ` +
          `${JSON.stringify(previous)} and ${JSON.stringify(key)}.`
        );
      }
      ids.set(id, key);
      if (id !== key) {
        if (/^[0-9a-f]{24}$/i.test(id)) legacyIdsDifferentFromFirebaseKeys++;
        else unexpectedIdMismatches.push(key);
      }
    }
  }

  const airports = new Map<string, AirportRecord>();
  for (const [key, value] of airportEntries) {
    if (!isObject(value)) throw new Error(`Airport ${JSON.stringify(key)} must be an object.`);
    const code = airportCode(value.code) || airportCode(key);
    if (!code) throw new Error(`Airport ${JSON.stringify(key)} has no usable code.`);
    if (airports.has(code)) throw new Error(`Duplicate normalized airport code ${JSON.stringify(code)}.`);
    airports.set(code, value as AirportRecord);
  }

  const active = flightEntries.filter(([, flight]) => (flight as JsonObject)._deleted !== true) as [string, JsonObject][];
  const nameToCode = consensusIndex(active, (f) => normalizedName(f.aircraftType), (f) => normalized(f.aircraftTypeCode));
  const registrationToCode = consensusIndex(active, (f) => normalized(f.aircraftRegistration), (f) => normalized(f.aircraftTypeCode));
  const codeToName = consensusIndex(active, (f) => normalized(f.aircraftTypeCode), (f) => normalizedName(f.aircraftType),
    (f) => usefulString(f.aircraftType));
  const proposals: FlightProposal[] = [];
  const findings: ReviewFinding[] = [];
  const warnings: ReviewFinding[] = [];
  const duplicateFlights = new Map<string, string[]>();
  for (const key of unexpectedIdMismatches) {
    addFinding(warnings, "id-key-mismatch",
      "Flight _id differs from its Firebase map key; updates use the map key.", key, ["_id"],
      { idMatchesKey: false });
  }

  for (const [key, flight] of active) {
    const duplicateKey = [normalized(flight.date), normalized(flight.flightno), normalized(flight.from), normalized(flight.to)]
      .filter(Boolean).join("|");
    if (duplicateKey.split("|").length === 4) {
      const keys = duplicateFlights.get(duplicateKey) || [];
      keys.push(key);
      duplicateFlights.set(duplicateKey, keys);
    }

    const changes = new Map<string, FieldChange>();
    const propose = (field: string, after: unknown, reason: string, evidence: JsonObject) => {
      if (changes.has(field) || Object.is(flight[field], after)) return;
      changes.set(field, {
        field,
        before: flight[field] === undefined ? null : flight[field],
        after,
        reason,
        evidence,
        confidence: "high",
      });
    };

    const converted: Partial<Record<"departureTime" | "arrivalTime", string>> = {};
    for (const [field, airportField] of [["departureTime", "from"], ["arrivalTime", "to"]] as const) {
      const value = flight[field];
      const airport = airportFor(airports, flight[airportField]);
      const resolution = resolveLocalIso(value, airport?.timezoneId);
      if (resolution.state === "resolved") {
        converted[field] = resolution.value;
        propose(field, resolution.value, "Converted an unambiguous airport-local timestamp to UTC.", {
          airport: airportCode(flight[airportField]) || null,
          timezone: airport?.timezoneId || null,
          offset: resolution.offset,
          interpretation: "airport-local",
        });
      } else if (resolution.state === "gap" || resolution.state === "overlap" || resolution.state === "invalid") {
        addFinding(findings, `local-time-${resolution.state}`,
          resolution.state === "gap" ? "Local timestamp falls in a DST gap." :
            resolution.state === "overlap" ? "Local timestamp is ambiguous during a DST overlap." :
              resolution.reason,
          key, [field], resolution.state === "overlap" ? { optionCount: resolution.options.length } : undefined);
      } else if (!isMissing(value) && !hasExplicitTimezone(value)) {
        addFinding(findings, "invalid-timestamp", "Timestamp is neither an explicit-zone ISO instant nor the supported local ISO format.",
          key, [field]);
      }
    }

    const effectiveDeparture = converted.departureTime || flight.departureTime;
    const effectiveArrival = converted.arrivalTime || flight.arrivalTime;
    const departureInstant = explicitInstant(effectiveDeparture);
    const arrivalInstant = explicitInstant(effectiveArrival);
    if (departureInstant !== null && arrivalInstant !== null) {
      if (arrivalInstant <= departureInstant) {
        addFinding(findings, "impossible-timing", "Arrival is not after departure.", key,
          ["departureTime", "arrivalTime", "durationMilliseconds"]);
      } else if (isMissing(flight.durationMilliseconds)) {
        propose("durationMilliseconds", arrivalInstant - departureInstant,
          converted.departureTime || converted.arrivalTime ?
            "Recomputed duration after timestamp normalization." : "Derived missing duration from explicit-zone timestamps.",
          { departureTime: effectiveDeparture, arrivalTime: effectiveArrival });
      } else if (typeof flight.durationMilliseconds === "number" &&
          Number.isFinite(flight.durationMilliseconds) &&
          Math.abs(flight.durationMilliseconds - (arrivalInstant - departureInstant)) >
          DURATION_CONFLICT_TOLERANCE_MS) {
        const correctedDurationMilliseconds = arrivalInstant - departureInstant;
        addFinding(findings, "duration-conflict",
          "Stored duration differs materially from the corrected timestamp interval.", key,
          ["departureTime", "arrivalTime", "durationMilliseconds"], {
            storedDurationMilliseconds: flight.durationMilliseconds,
            correctedDurationMilliseconds,
            differenceMilliseconds: Math.abs(
              flight.durationMilliseconds - correctedDurationMilliseconds
            ),
          });
      }
    }

    for (const airportField of ["from", "to"] as const) {
      const code = airportCode(flight[airportField]);
      if (code && !airports.has(code)) {
        addFinding(findings, "unknown-airport", "Airport code is absent from the supplied airport export.", key, [airportField],
          { airport: code });
      }
    }
    for (const field of ["distance", "plannedDistance", "flownDistance"]) {
      if (!isMissing(flight[field]) && !finitePositive(flight[field])) {
        addFinding(findings, "invalid-stored-distance",
          "A populated distance is not a finite positive number and was preserved for manual review.",
          key, [field], { value: flight[field] });
      }
    }
    if (isMissing(flight.distance) && !isMissing(flight.from) && !isMissing(flight.to)) {
      const from = airportFor(airports, flight.from);
      const to = airportFor(airports, flight.to);
      if (from && to) {
        const distance = haversine(from, to);
        if (distance && distance > 0) {
          propose("distance", distance, "Derived missing distance from airport coordinates using the backend haversine formula.",
            { from: airportCode(flight.from)!, to: airportCode(flight.to)!, unit: "km" });
        } else {
          addFinding(findings, "malformed-airport-coordinates", "Airport coordinates are missing, invalid, or produce no distance.",
            key, ["distance"], { from: airportCode(flight.from)!, to: airportCode(flight.to)! });
        }
      }
    }

    const aero = trustedAeroEvidence(flight, airports);
    if (aero && !aero.trusted) {
      addFinding(findings, "untrusted-aeroapi-evidence", aero.reason!, key, ["aeroApiFlight"]);
    }
    if (aero?.trusted) {
      const candidate = aero.candidate;
      const origin = isObject(candidate.origin) ? candidate.origin : {};
      const destination = isObject(candidate.destination) ? candidate.destination : {};
      const providerEvidence = { provider: "cached-aeroapi", faFlightId: usefulString(candidate.fa_flight_id) || null };
      const fill = (field: string, value: unknown, reason: string, evidence: JsonObject = providerEvidence) => {
        if (isMissing(flight[field]) && !isMissing(value)) propose(field, value, reason, evidence);
      };
      fill("from", usefulString(origin.code_iata), "Filled missing origin from trusted cached AeroAPI evidence.");
      fill("to", usefulString(destination.code_iata), "Filled missing destination from trusted cached AeroAPI evidence.");
      const departureChoices: [string, unknown, string][] = [
        ["actualDepartureTime", candidate.actual_out, "actual"],
        ["estimatedDepartureTime", candidate.estimated_out, "estimated"],
        ["scheduledDepartureTime", candidate.scheduled_out, "scheduled"],
      ];
      const arrivalChoices: [string, unknown, string][] = [
        ["actualArrivalTime", candidate.actual_in, "actual"],
        ["estimatedArrivalTime", candidate.estimated_in, "estimated"],
        ["scheduledArrivalTime", candidate.scheduled_in, "scheduled"],
      ];
      for (const [field, value] of [
        ...departureChoices,
        ["scheduledTakeoffTime", candidate.scheduled_off],
        ["estimatedTakeoffTime", candidate.estimated_off],
        ["actualTakeoffTime", candidate.actual_off],
        ["scheduledLandingTime", candidate.scheduled_on],
        ["estimatedLandingTime", candidate.estimated_on],
        ["actualLandingTime", candidate.actual_on],
        ...arrivalChoices,
      ] as [string, unknown][]) {
        fill(field, usefulString(value), "Filled missing detailed timestamp from trusted cached AeroAPI evidence.");
      }
      const departure = departureChoices.find(([, value]) => usefulString(value));
      const arrival = arrivalChoices.find(([, value]) => usefulString(value));
      if (departure) {
        fill("departureTime", usefulString(departure[1]), "Filled missing canonical departure from trusted cached AeroAPI evidence.");
        const effective = converted.departureTime || changes.get("departureTime")?.after ||
          flight.departureTime;
        if (explicitInstant(effective) !== null &&
            explicitInstant(effective) === explicitInstant(departure[1])) {
          fill("departureTimeSource", departure[2], "Recorded the trusted cached AeroAPI canonical departure source.");
        }
      }
      if (arrival) {
        fill("arrivalTime", usefulString(arrival[1]), "Filled missing canonical arrival from trusted cached AeroAPI evidence.");
        const effective = converted.arrivalTime || changes.get("arrivalTime")?.after ||
          flight.arrivalTime;
        if (explicitInstant(effective) !== null &&
            explicitInstant(effective) === explicitInstant(arrival[1])) {
          fill("arrivalTimeSource", arrival[2], "Recorded the trusted cached AeroAPI canonical arrival source.");
        }
      }
      fill("aircraftTypeCode", normalized(candidate.aircraft_type),
        "Filled missing aircraft type code from trusted cached AeroAPI evidence.");
      fill("aircraftRegistration", usefulString(candidate.registration),
        "Filled missing aircraft registration from trusted cached AeroAPI evidence.");
      fill("carrier", usefulString(candidate.operator_name) || usefulString(candidate.operator),
        "Filled missing carrier from trusted cached AeroAPI evidence.");
      if (isMissing(flight.plannedDistance) && finitePositive(candidate.route_distance)) {
        propose("plannedDistance", round6(candidate.route_distance * KM_PER_STATUTE_MILE),
          "Converted trusted cached AeroAPI route distance from statute miles to kilometres.",
          { ...providerEvidence, sourceMiles: candidate.route_distance, unit: "km" });
      }
      const faFlightId = usefulString(candidate.fa_flight_id);
      fill("flightAwareFlightId", faFlightId, "Filled missing provider flight identifier from trusted cached AeroAPI evidence.");
      const tracks = isObject(parsedFlights.aeroApiTracks) ? parsedFlights.aeroApiTracks : {};
      const track = faFlightId && isObject(tracks[faFlightId]) ? tracks[faFlightId] as JsonObject : undefined;
      if (isMissing(flight.flownDistance) && track && finitePositive(track.actual_distance)) {
        propose("flownDistance", round6(track.actual_distance * KM_PER_STATUTE_MILE),
          "Converted trusted cached AeroAPI track distance from statute miles to kilometres.",
          { ...providerEvidence, sourceMiles: track.actual_distance, unit: "km" });
      } else if (track && !isMissing(track.actual_distance) &&
          !finiteNonNegative(track.actual_distance)) {
        addFinding(findings, "invalid-track-distance", "Cached AeroAPI actual_distance is malformed or negative.",
          key, ["flownDistance"]);
      }
    }

    if (isMissing(flight.aircraftTypeCode)) {
      const nameEvidence = normalizedName(flight.aircraftType);
      const registrationEvidence = normalized(flight.aircraftRegistration);
      const byName = nameEvidence ? nameToCode.eligible.get(nameEvidence) : undefined;
      const byRegistration = registrationEvidence ? registrationToCode.eligible.get(registrationEvidence) : undefined;
      if (byName && byRegistration && byName.target !== byRegistration.target) {
        addFinding(findings, "aircraft-inference-conflict",
          "Aircraft name and registration consensus point to different type codes.", key,
          ["aircraftTypeCode"], { nameCode: byName.target, registrationCode: byRegistration.target });
      } else {
        const inferred = byName || byRegistration;
        if (inferred && !changes.has("aircraftTypeCode")) {
          propose("aircraftTypeCode", inferred.target, "Filled missing aircraft type code from local historical consensus.", {
            source: byName ? "aircraftType" : "aircraftRegistration",
            support: inferred.support,
          });
        }
      }
    }
    if (isMissing(flight.aircraftType)) {
      const code = normalized(flight.aircraftTypeCode) ||
        (changes.get("aircraftTypeCode")?.after as string | undefined);
      const inferred = code ? codeToName.eligible.get(code) : undefined;
      if (inferred?.display) {
        propose("aircraftType", inferred.display, "Filled missing aircraft display name from local historical consensus.",
          { source: "aircraftTypeCode", code, support: inferred.support });
      }
    }

    const proposedValue = (field: string) => changes.get(field)?.after ?? flight[field];
    if (!changes.has("durationMilliseconds") && isMissing(flight.durationMilliseconds)) {
      const departure = explicitInstant(proposedValue("departureTime"));
      const arrival = explicitInstant(proposedValue("arrivalTime"));
      if (departure !== null && arrival !== null && arrival > departure) {
        propose("durationMilliseconds", arrival - departure,
          "Derived missing duration from the proposed explicit-zone timestamps.",
          { departureTime: proposedValue("departureTime"), arrivalTime: proposedValue("arrivalTime") });
      }
    }
    if (!changes.has("distance") && isMissing(flight.distance)) {
      const fromCode = airportCode(proposedValue("from"));
      const toCode = airportCode(proposedValue("to"));
      const from = fromCode ? airports.get(fromCode) : undefined;
      const to = toCode ? airports.get(toCode) : undefined;
      if (from && to) {
        const distance = haversine(from, to);
        if (distance && distance > 0) {
          propose("distance", distance,
            "Derived missing distance from the proposed airports using the backend haversine formula.",
            { from: fromCode!, to: toCode!, unit: "km" });
        }
      }
    }
    if (changes.size) proposals.push({ firebaseKey: key, changes: [...changes.values()].sort((a, b) => a.field.localeCompare(b.field)) });
  }

  for (const keys of duplicateFlights.values()) {
    if (keys.length > 1) {
      for (const key of keys.sort()) {
        addFinding(findings, "duplicate-likely-flight",
          "Multiple active records share normalized date, flight number, origin, and destination.", key, undefined,
          { duplicateCount: keys.length });
      }
    }
  }
  for (const [source, targets] of nameToCode.conflicts) {
    addFinding(findings, "contradictory-aircraft-mapping", "Aircraft name maps to multiple aircraft type codes.",
      undefined, ["aircraftType", "aircraftTypeCode"], { normalizedSource: source, targets });
  }
  for (const [source, targets] of registrationToCode.conflicts) {
    addFinding(findings, "contradictory-aircraft-mapping", "Aircraft registration maps to multiple aircraft type codes.",
      undefined, ["aircraftRegistration", "aircraftTypeCode"], { normalizedSource: source, targets });
  }
  for (const [source, targets] of codeToName.conflicts) {
    addFinding(findings, "contradictory-aircraft-mapping", "Aircraft type code maps to multiple aircraft names.",
      undefined, ["aircraftTypeCode", "aircraftType"], { normalizedSource: source, targets });
  }

  proposals.sort((a, b) => a.firebaseKey.localeCompare(b.firebaseKey));
  findings.sort((a, b) => (a.firebaseKey || "").localeCompare(b.firebaseKey || "") ||
    a.category.localeCompare(b.category) || a.message.localeCompare(b.message));
  warnings.sort((a, b) => (a.firebaseKey || "").localeCompare(b.firebaseKey || "") || a.category.localeCompare(b.category));
  const forward: [string, unknown][] = [];
  const rollback: [string, unknown][] = [];
  for (const proposal of proposals) {
    for (const change of proposal.changes) {
      const path = `/flights/${proposal.firebaseKey}/${change.field}`;
      forward.push([path, change.after]);
      rollback.push([path, change.before]);
    }
  }
  const fieldNames = proposals.flatMap((proposal) => proposal.changes.map((change) => change.field));
  const findingNames = findings.map((finding) => finding.category);
  const flightsHash = sourceHash(input.flightsSource.content);
  const airportsHash = sourceHash(input.airportsSource.content);
  return {
    version: VERSION,
    generatedAt: input.generatedAt || new Date().toISOString(),
    sources: {
      flights: basename(input.flightsSource.path),
      airports: basename(input.airportsSource.path),
      fingerprint: {
        algorithm: "sha256",
        flights: flightsHash,
        airports: airportsHash,
        combined: sourceHash(`${flightsHash}:${airportsHash}`),
      },
    },
    summary: {
      totalFlights: flightEntries.length,
      activeFlights: active.length,
      deletedFlights: flightEntries.length - active.length,
      flightsWithChanges: proposals.length,
      proposedFieldChanges: fieldNames.length,
      reviewFindings: findings.length,
      integrityWarnings: warnings.length,
      legacyIdsDifferentFromFirebaseKeys,
      changesByField: counts(fieldNames),
      findingsByCategory: counts(findingNames),
    },
    proposedChanges: proposals,
    reviewOnlyFindings: findings,
    integrityWarnings: warnings,
    forwardUpdates: sortedObject(forward),
    rollbackUpdates: sortedObject(rollback),
  };
};

export const stableJson = (value: unknown): string => {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (!isObject(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sort(child)]));
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
};
