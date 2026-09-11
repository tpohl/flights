import { LhCarrier, LhFlight } from "./models";
import { Flight, FlightManualField } from "../../models/flight";
import { parseFlightTime } from "../../util/flightTime";

const lhApiTypeReplacements = {
  "32V": "Airbus A320neo",
  "31D": "Airbus A319",
  "34Q": "Airbus A340-300",
  "31K": "Airbus A319",
};
export const replaceType = function(lhApiType) {
  const replacement = lhApiTypeReplacements[lhApiType];
  if (replacement) {
    return replacement;
  } else {
    return lhApiType;
  }
};

const transformRegistration = function(lhApiRegistration?: string) {
  if (!lhApiRegistration) {
    return undefined;
  } else if (lhApiRegistration.startsWith("D")) { // German Registration
    return `D-${lhApiRegistration.slice(1)}`;
  } else if (lhApiRegistration.startsWith("HB")) { // Swiss
    return `HB-${lhApiRegistration.slice(2)}`;
  } else if (lhApiRegistration.startsWith("OE")) { // Austrian Registrations
    return `OE-${lhApiRegistration.slice(2)}`;
  } else if (lhApiRegistration.startsWith("YL")) { // Air Baltic Registrations
    return `YL-${lhApiRegistration.slice(2)}`;
  } else {
    return lhApiRegistration;
  }
};

const lhApiCarrierReplacements = {
  "LH": "Lufthansa",
  "LX": "Swiss",
  "OS": "Austrian",
};
const transformCarrier = function(lhCarrier: LhCarrier) {
  const carrierId = lhCarrier.AirlineID;
  const replacement = lhApiCarrierReplacements[carrierId];
  if (replacement) {
    return replacement;
  } else {
    return carrierId;
  }
};

const normalizeUtcTime = (value?: string): string | undefined => {
  if (!value) return undefined;
  // Lufthansa explicitly labels these fields UTC, even when the value omits Z.
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  if (!parseFlightTime(timestamp)) throw new Error("Lufthansa returned an invalid UTC timestamp.");
  return timestamp;
};

export const toFlight = function(lhApiFlight: LhFlight, existingFlight: Flight): Flight {
  if (!lhApiFlight?.Departure?.AirportCode || !lhApiFlight?.Arrival?.AirportCode) {
    throw new Error("Lufthansa returned no usable flight.");
  }
  const flight = { ...existingFlight };
  const setAvailable = <K extends Exclude<FlightManualField, "distance">>(field: K, value: Flight[K]) => {
    if (value && flight.manualOverrides?.[field] !== true) {
      flight[field] = value;
    }
  };
  flight.lhApiFlight = lhApiFlight;
  setAvailable("from", lhApiFlight.Departure.AirportCode);
  setAvailable("to", lhApiFlight.Arrival.AirportCode);
  setAvailable("departureTime", normalizeUtcTime(lhApiFlight.Departure.ActualTimeUTC?.DateTime ||
    lhApiFlight.Departure.ScheduledTimeUTC?.DateTime));
  setAvailable("arrivalTime", normalizeUtcTime(lhApiFlight.Arrival.ActualTimeUTC?.DateTime ||
    lhApiFlight.Arrival.ScheduledTimeUTC?.DateTime));
  setAvailable("aircraftTypeCode", lhApiFlight.Equipment?.AircraftCode);
  setAvailable("aircraftRegistration", transformRegistration(lhApiFlight.Equipment?.AircraftRegistration));
  if (lhApiFlight.OperatingCarrier?.AirlineID) {
    setAvailable("carrier", transformCarrier(lhApiFlight.OperatingCarrier));
  }
  return flight;
};
