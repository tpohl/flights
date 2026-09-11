import { Flight } from '../models/flight';
import { hasExplicitTimezone } from '../models/flight-times';

const CONTEXT_FIELDS = ['flightno', 'date', 'from', 'to', 'departureTime', 'arrivalTime'] as const;
export type FlightWriteContext = Pick<Flight, typeof CONTEXT_FIELDS[number]>;
export type FlightMergeResult = { flight: Flight; error?: never } | { flight?: never; error: string };

export function flightWriteContext(flight: Flight): FlightWriteContext {
  return {
    flightno: flight.flightno, date: flight.date, from: flight.from, to: flight.to,
    departureTime: flight.departureTime, arrivalTime: flight.arrivalTime
  };
}

export function flightWriteValues(flight: Partial<Flight>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(flight)
      .filter(([key, value]) => key !== '_objectReference' && value !== undefined)
      .map(([key, value]) => [key, value === '' ? null : value])
  );
}

export function mergeFlightChanges(current: Flight | null, changes: Partial<Flight>, expected?: FlightWriteContext): FlightMergeResult {
  if (!current || current._deleted) return { error: 'This flight no longer exists. Your changes were not saved.' };
  if (expected && CONTEXT_FIELDS.some(field => (current[field] || null) !== (expected[field] || null))) {
    return { error: 'Flight timing or route details changed while saving. Review the updated flight and try again.' };
  }
  const values = flightWriteValues(changes);
  delete values['_id'];
  delete values['manualOverrides'];
  const merged = { ...current, ...values };
  if (changes.manualOverrides) {
    merged.manualOverrides = { ...current.manualOverrides, ...changes.manualOverrides };
  }
  if (['departureTime', 'arrivalTime', 'durationMilliseconds'].some(field => field in values)) {
    if (merged.departureTime && merged.arrivalTime) {
      if (!hasExplicitTimezone(merged.departureTime) || !hasExplicitTimezone(merged.arrivalTime)) {
        return { error: 'Both flight times need an explicit timezone before duration can be recalculated.' };
      }
      const duration = Date.parse(merged.arrivalTime) - Date.parse(merged.departureTime);
      if (duration <= 0) return { error: 'Arrival must be after departure. Review the updated flight times.' };
      merged.durationMilliseconds = duration;
    } else {
      merged.durationMilliseconds = null;
    }
  }
  return { flight: merged };
}
