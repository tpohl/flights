import {
  AeroApiEnrichment,
  Flight,
  FlightStatus,
  FlightTimeSource,
} from "../../models/flight";
import { AeroApiFlight, AeroAPITrackResponse } from "./models";

const KM_PER_STATUTE_MILE = 1.609344;

const time = (
  manual: boolean | undefined,
  actual: string | undefined,
  estimated: string | undefined,
  scheduled: string | undefined
): { value?: string; source: FlightTimeSource } => {
  if (manual) return { source: "manual" };
  if (actual) return { value: actual, source: "actual" };
  if (estimated) return { value: estimated, source: "estimated" };
  if (scheduled) return { value: scheduled, source: "scheduled" };
  return { source: "unknown" };
};

const status = (candidate: AeroApiFlight): FlightStatus => {
  if (candidate.actual_in) return "landed";
  if (candidate.scheduled_out || candidate.estimated_out || candidate.actual_out) return "scheduled";
  return "guess";
};

const resetProviderFields = (original: Flight, candidate: AeroApiFlight): Flight => {
  const result = { ...original };
  if (!original.flightAwareFlightId ||
      original.flightAwareFlightId === candidate.fa_flight_id) return result;

  const clear = (key: keyof Flight) => Object.assign(result, { [key]: null });
  for (const key of [
    "scheduledDepartureTime", "estimatedDepartureTime", "actualDepartureTime",
    "scheduledTakeoffTime", "estimatedTakeoffTime", "actualTakeoffTime",
    "scheduledLandingTime", "estimatedLandingTime", "actualLandingTime",
    "scheduledArrivalTime", "estimatedArrivalTime", "actualArrivalTime",
    "departureTimeSource", "arrivalTimeSource", "plannedDistance", "flownDistance",
    "aeroApiFlight", "flightAwareFlight", "lhApiFlight", "flightAwareFlightId",
    "icaoCarrier", "cleanFlightNo",
  ] as (keyof Flight)[]) clear(key);
  for (const key of [
    "from", "to", "departureTime", "arrivalTime", "aircraftTypeCode",
    "aircraftType", "aircraftRegistration", "carrier",
  ] as const) {
    if (original.manualOverrides?.[key] !== true) clear(key);
  }
  return result;
};

const setProviderValue = (
  flight: Flight,
  key: keyof Flight,
  value: string | undefined
) => {
  if (value !== undefined) Object.assign(flight, { [key]: value });
};

export const isFinalAeroApiResult = (
  candidate: AeroApiFlight,
  track: AeroAPITrackResponse | null
) => Boolean(candidate.actual_out && candidate.actual_in &&
  track && Number(track.actual_distance) > 0);

export const applyAeroApiFlight = (
  original: Flight,
  candidate: AeroApiFlight,
  track: AeroAPITrackResponse | null,
  enrichment: AeroApiEnrichment
): Flight => {
  const departure = time(
    original.manualOverrides?.departureTime,
    candidate.actual_out,
    candidate.estimated_out,
    candidate.scheduled_out
  );
  const arrival = time(
    original.manualOverrides?.arrivalTime,
    candidate.actual_in,
    candidate.estimated_in,
    candidate.scheduled_in
  );
  const result = resetProviderFields(original, candidate);
  if (departure.value) result.departureTime = departure.value;
  if (arrival.value) result.arrivalTime = arrival.value;
  Object.assign(result, {
    departureTimeSource: departure.source,
    arrivalTimeSource: arrival.source,
    status: status(candidate),
    aeroApiFlight: candidate,
    flightAwareFlightId: candidate.fa_flight_id,
    aeroApiEnrichment: enrichment,
  });
  setProviderValue(result, "scheduledDepartureTime", candidate.scheduled_out);
  setProviderValue(result, "estimatedDepartureTime", candidate.estimated_out);
  setProviderValue(result, "actualDepartureTime", candidate.actual_out);
  setProviderValue(result, "scheduledTakeoffTime", candidate.scheduled_off);
  setProviderValue(result, "estimatedTakeoffTime", candidate.estimated_off);
  setProviderValue(result, "actualTakeoffTime", candidate.actual_off);
  setProviderValue(result, "scheduledLandingTime", candidate.scheduled_on);
  setProviderValue(result, "estimatedLandingTime", candidate.estimated_on);
  setProviderValue(result, "actualLandingTime", candidate.actual_on);
  setProviderValue(result, "scheduledArrivalTime", candidate.scheduled_in);
  setProviderValue(result, "estimatedArrivalTime", candidate.estimated_in);
  setProviderValue(result, "actualArrivalTime", candidate.actual_in);
  if (candidate.origin?.code_iata) result.from = candidate.origin.code_iata;
  if (candidate.destination?.code_iata) result.to = candidate.destination.code_iata;
  if (candidate.aircraft_type) {
    result.aircraftTypeCode = candidate.aircraft_type;
    if (candidate.aircraft_type !== original.aircraftTypeCode &&
        original.manualOverrides?.aircraftType !== true) {
      result.aircraftType = null;
    }
  }
  if (candidate.registration) result.aircraftRegistration = candidate.registration;
  const carrier = candidate.operator_name?.trim() || candidate.operator?.trim();
  if (carrier) result.carrier = carrier;
  if (typeof candidate.route_distance === "number" && candidate.route_distance > 0) {
    result.plannedDistance = candidate.route_distance * KM_PER_STATUTE_MILE;
  }
  if (track && typeof track.actual_distance === "number" && track.actual_distance > 0) {
    result.flownDistance = track.actual_distance * KM_PER_STATUTE_MILE;
  }
  return result;
};
