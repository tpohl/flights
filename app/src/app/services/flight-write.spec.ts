import { Flight } from '../models/flight';
import { flightWriteValues, mergeFlightChanges, flightWriteContext } from './flight-write';

describe('Flight writes', () => {
  const original = Object.assign(new Flight(), {
    _id: 'flight-1', note: 'Saved note', aircraftRegistration: 'D-TEST',
    departureTime: '2026-07-01T10:00:00Z', manualOverrides: { aircraftRegistration: true }
  });

  it('preserves unrelated fields and existing manual overrides', () => {
    const result = mergeFlightChanges(original, { departureTime: '2026-07-01T11:00:00Z', manualOverrides: { departureTime: true } }).flight;
    expect(result.note).toBe('Saved note');
    expect(result.aircraftRegistration).toBe('D-TEST');
    expect(result.manualOverrides).toEqual({ aircraftRegistration: true, departureTime: true });
    expect(original.manualOverrides).toEqual({ aircraftRegistration: true });
    expect(original.departureTime).toBe('2026-07-01T10:00:00Z');
  });

  it('applies a partial edit against the latest database state', () => {
    const latest = { ...original, aircraftRegistration: 'D-NEW' };
    expect(mergeFlightChanges(latest, { note: 'My draft' }).flight.aircraftRegistration).toBe('D-NEW');
  });

  it('does not resurrect missing or deleted records', () => {
    expect(mergeFlightChanges(null, { note: 'Draft' }).error).toContain('no longer exists');
    expect(mergeFlightChanges({ ...original, _deleted: true }, { note: 'Draft' }).error).toContain('no longer exists');
  });

  it('omits local metadata and undefined fields but preserves false and zero', () => {
    const input: Partial<Flight> = { _objectReference: 'local/path', seat: undefined, note: '', validatedAnomaly: false, distance: 0 };
    expect(flightWriteValues(input)).toEqual({ note: null, validatedAnomaly: false, distance: 0 });
    expect(input.note).toBe('');
    expect(input._objectReference).toBe('local/path');
  });

  it('does not replace an existing record identifier', () => {
    expect(mergeFlightChanges(original, { _id: 'wrong-id' }).flight._id).toBe('flight-1');
  });

  it('rejects a concurrent timestamp change inside the transaction', () => {
    const initial = { ...original, arrivalTime: '2026-07-01T12:00:00Z' };
    const latest = { ...initial, arrivalTime: '2026-07-01T11:00:00Z' };
    const result = mergeFlightChanges(latest, {
      departureTime: '2026-07-01T11:30:00Z', durationMilliseconds: 1800000
    }, flightWriteContext(initial));
    expect(result.flight).toBeUndefined();
    expect(result.error).toContain('changed while saving');
  });

  it('rejects concurrent route changes that would invalidate local-time conversion', () => {
    const initial = { ...original, from: 'BER' };
    const latest = { ...initial, from: 'JFK' };
    expect(mergeFlightChanges(latest, { departureTime: '2026-07-01T11:30:00Z' }, flightWriteContext(initial)).error)
      .toContain('changed while saving');
  });

  it('derives duration from the merged timestamps, not an outdated client calculation', () => {
    const latest = { ...original, arrivalTime: '2026-07-01T13:00:00Z' };
    const result = mergeFlightChanges(latest, { departureTime: '2026-07-01T11:30:00Z', durationMilliseconds: 1800000 });
    expect(result.flight.durationMilliseconds).toBe(5400000);
  });

  it('cannot commit arrival before departure even without an expected snapshot', () => {
    const latest = { ...original, arrivalTime: '2026-07-01T11:00:00Z' };
    expect(mergeFlightChanges(latest, { departureTime: '2026-07-01T11:30:00Z', durationMilliseconds: 1800000 }).error)
      .toContain('Arrival must be after departure');
  });
});
