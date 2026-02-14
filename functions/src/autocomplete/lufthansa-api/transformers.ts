import { LhCarrier, LhFlight } from "./models";
import { Flight } from "../../models/flight";

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

export const toFlight = function(lhApiFlight: LhFlight, existingFlight: Flight): Flight {
  const flight = existingFlight ? existingFlight : new Flight();
  flight.lhApiFlight = lhApiFlight;
  if (!!lhApiFlight.Departure && !!lhApiFlight.Arrival) {
    flight.from = lhApiFlight.Departure.AirportCode;
    if (lhApiFlight.Departure.ActualTimeUTC) {
      flight.departureTime = lhApiFlight.Departure.ActualTimeUTC.DateTime;
    } else {
      flight.departureTime = lhApiFlight.Departure.ScheduledTimeUTC.DateTime;
    }
    flight.to = lhApiFlight.Arrival.AirportCode;
    if (lhApiFlight.Arrival.ActualTimeUTC) {
      flight.arrivalTime = lhApiFlight.Arrival.ActualTimeUTC.DateTime;
    } else {
      flight.arrivalTime = lhApiFlight.Arrival.ScheduledTimeUTC.DateTime;
    }

    flight.aircraftTypeCode = lhApiFlight.Equipment.AircraftCode;
    if (!!lhApiFlight.Equipment.AircraftRegistration && !("" === lhApiFlight.Equipment.AircraftRegistration)) {
      flight.aircraftRegistration = transformRegistration(lhApiFlight.Equipment.AircraftRegistration);
    }
    flight.carrier = transformCarrier(lhApiFlight.OperatingCarrier);
  } else {
    console.log("LH API FLight is invalid", lhApiFlight);
  }
  return flight;
};
