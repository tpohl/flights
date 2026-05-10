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
    
    // Departure Time
    if (lhApiFlight.Departure.ActualTimeUTC) {
      flight.departureTime = lhApiFlight.Departure.ActualTimeUTC.DateTime;
    } else if (lhApiFlight.Departure.ScheduledTimeUTC) {
      flight.departureTime = lhApiFlight.Departure.ScheduledTimeUTC.DateTime;
    } else if ((lhApiFlight.Departure as any).Actual) {
      const act = (lhApiFlight.Departure as any).Actual;
      flight.departureTime = `${act.Date}T${act.Time}:00`;
    } else if ((lhApiFlight.Departure as any).Scheduled) {
      const sched = (lhApiFlight.Departure as any).Scheduled;
      flight.departureTime = `${sched.Date}T${sched.Time}:00`;
    }

    flight.to = lhApiFlight.Arrival.AirportCode;
    
    // Arrival Time
    if (lhApiFlight.Arrival.ActualTimeUTC) {
      flight.arrivalTime = lhApiFlight.Arrival.ActualTimeUTC.DateTime;
    } else if (lhApiFlight.Arrival.ScheduledTimeUTC) {
      flight.arrivalTime = lhApiFlight.Arrival.ScheduledTimeUTC.DateTime;
    } else if ((lhApiFlight.Arrival as any).Actual) {
      const act = (lhApiFlight.Arrival as any).Actual;
      flight.arrivalTime = `${act.Date}T${act.Time}:00`;
    } else if ((lhApiFlight.Arrival as any).Scheduled) {
      const sched = (lhApiFlight.Arrival as any).Scheduled;
      flight.arrivalTime = `${sched.Date}T${sched.Time}:00`;
    }

    if (lhApiFlight.Equipment && lhApiFlight.Equipment.AircraftCode) {
      flight.aircraftTypeCode = lhApiFlight.Equipment.AircraftCode;
    }
    if (lhApiFlight.Equipment && !!lhApiFlight.Equipment.AircraftRegistration && !("" === lhApiFlight.Equipment.AircraftRegistration)) {
      flight.aircraftRegistration = transformRegistration(lhApiFlight.Equipment.AircraftRegistration);
    }
    if (lhApiFlight.OperatingCarrier) {
      flight.carrier = transformCarrier(lhApiFlight.OperatingCarrier);
    }
  } else {
    console.log("LH API FLight is invalid", lhApiFlight);
  }
  return flight;
};
