import { AeroApiFlight } from "./models";

export class InvalidFlightNumberError extends Error {}
export class FlightDateOutsideAeroApiWindowError extends Error {}

export type MatchResult =
  | { state: "matched"; flight: AeroApiFlight; candidateCount: number }
  | { state: "ambiguous"; candidateCount: number; summaries: CandidateSummary[] }
  | { state: "not_found"; candidateCount: number };

export interface CandidateSummary {
  faFlightId: string;
  ident?: string;
  from?: string;
  to?: string;
  departure?: string;
}

const DAY = 24 * 60 * 60 * 1000;

export const normalizeFlightNumber = (value: string): string => {
  const normalized = String(value || "").toUpperCase().replace(/[\s-]+/g, "");
  if (!/^[A-Z0-9]{2}[0-9]{1,4}[A-Z]?$/.test(normalized)) {
    throw new InvalidFlightNumberError(
      "Enter a valid IATA flight number, for example LH400 or 4U9525."
    );
  }
  return normalized;
};

const utcDate = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
};

const iso = (value: number) => new Date(value).toISOString();

export const buildFlightSearchWindow = (
  date: string,
  now = new Date()
): { start: string; end: string } => {
  const target = utcDate(date);
  if (!target) throw new FlightDateOutsideAeroApiWindowError("Enter a valid flight date.");
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetTime = target.valueOf();
  if (targetTime < today - 10 * DAY || targetTime > today + 2 * DAY) {
    throw new FlightDateOutsideAeroApiWindowError(
      "The flight date is outside AeroAPI's recent-flight window."
    );
  }
  const earliest = now.valueOf() - 10 * DAY;
  const latest = now.valueOf() + 2 * DAY;
  const start = Math.max(targetTime - DAY, earliest);
  const end = Math.min(targetTime + 2 * DAY, latest);
  if (end <= start) {
    throw new FlightDateOutsideAeroApiWindowError(
      "The flight date is outside AeroAPI's recent-flight window."
    );
  }
  return { start: iso(start), end: iso(end) };
};

const normalizedIdent = (value?: string) =>
  value?.toUpperCase().replace(/[\s-]+/g, "");

export const aeroApiFlightMatchesDesignator = (
  flight: AeroApiFlight | undefined,
  inputFlightNumber: string
): boolean => {
  if (!flight) return false;
  const flightNumber = normalizeFlightNumber(inputFlightNumber);
  return [
    flight.ident,
    flight.ident_iata,
    flight.ident_icao,
    ...(flight.codeshares || []),
    ...(flight.codeshares_iata || []),
  ].map(normalizedIdent).includes(flightNumber);
};

const localDate = (timestamp: string | undefined, timezone: string | undefined): string | null => {
  if (!timestamp || !timezone) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
};

const departureAnchor = (flight: AeroApiFlight): string | undefined =>
  flight.scheduled_out || flight.scheduled_off || flight.estimated_out ||
  flight.estimated_off || flight.actual_out || flight.actual_off;

const airportCode = (airport: AeroApiFlight["origin"]) =>
  normalizedIdent(airport?.code_iata || airport?.code);

export const summarizeCandidate = (flight: AeroApiFlight): CandidateSummary => ({
  faFlightId: flight.fa_flight_id,
  ident: flight.ident_iata || flight.ident,
  from: airportCode(flight.origin),
  to: airportCode(flight.destination),
  departure: departureAnchor(flight),
});

export const matchAeroApiFlight = (
  inputFlightNumber: string,
  date: string,
  flights: AeroApiFlight[],
  route: { from?: string; to?: string } = {}
): MatchResult => {
  const flightNumber = normalizeFlightNumber(inputFlightNumber);
  const candidates = flights.filter((candidate) =>
    aeroApiFlightMatchesDesignator(candidate, flightNumber) &&
      !candidate.cancelled &&
      !candidate.position_only &&
      localDate(departureAnchor(candidate), candidate.origin?.timezone) === date
  );
  if (!candidates.length) return { state: "not_found", candidateCount: 0 };

  const from = normalizedIdent(route.from);
  const to = normalizedIdent(route.to);
  const hasRouteConstraint = Boolean(from || to);
  const routeMatches = hasRouteConstraint ?
    candidates.filter((candidate) =>
      (!from || airportCode(candidate.origin) === from) &&
      (!to || airportCode(candidate.destination) === to)) :
    candidates;
  if (hasRouteConstraint && !routeMatches.length) {
    return { state: "not_found", candidateCount: 0 };
  }
  const best = routeMatches;
  if (best.length === 1) {
    return { state: "matched", flight: best[0], candidateCount: candidates.length };
  }
  return {
    state: "ambiguous",
    candidateCount: best.length,
    summaries: best.slice(0, 15).map(summarizeCandidate),
  };
};
