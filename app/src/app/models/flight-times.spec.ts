import { hasExplicitTimezone, isFlightDate, localTimeOptions, storedLocalTime } from './flight-times';

describe('Flight times', () => {
  it('converts local times independently of the browser timezone', () => {
    expect(localTimeOptions('2026-07-01', '12:30', 'Europe/Berlin').options)
      .toEqual([{ value: '2026-07-01T10:30:00.000Z', offset: 'UTC+02:00' }]);
    expect(localTimeOptions('2026-07-01', '12:30', 'America/New_York').options[0].value)
      .toBe('2026-07-01T16:30:00.000Z');
  });

  it('supports midnight, seconds, fractional offsets and UTC date changes', () => {
    expect(localTimeOptions('2026-07-01', '00:00:15', 'Asia/Kathmandu').options[0].value)
      .toBe('2026-06-30T18:15:15.000Z');
  });

  it('does not fabricate a time for an empty input', () => {
    expect(localTimeOptions('2026-07-01', '', '').options).toEqual([]);
  });

  it('rejects invalid dates, times and missing or invalid timezones', () => {
    expect(isFlightDate('2026-02-29')).toBeFalse();
    expect(isFlightDate('2024-02-29')).toBeTrue();
    expect(localTimeOptions('2026-02-30', '12:00', 'UTC').error).toBeTruthy();
    expect(localTimeOptions('2026-07-01', '24:00', 'UTC').error).toBeTruthy();
    expect(localTimeOptions('2026-07-01', '12:00', '').error).toContain('unavailable');
    expect(localTimeOptions('2026-07-01', '12:00', 'Not/AZone').error).toContain('invalid');
  });

  it('rejects nonexistent local times during spring daylight-saving changes', () => {
    const result = localTimeOptions('2026-03-29', '02:30', 'Europe/Berlin');
    expect(result.options).toEqual([]);
    expect(result.error).toContain('does not exist');
  });

  it('exposes both occurrences of an ambiguous local time', () => {
    expect(localTimeOptions('2026-10-25', '02:30', 'Europe/Berlin').options).toEqual([
      { value: '2026-10-25T00:30:00.000Z', offset: 'UTC+02:00' },
      { value: '2026-10-25T01:30:00.000Z', offset: 'UTC+01:00' }
    ]);
  });

  it('handles half-hour daylight-saving overlaps', () => {
    expect(localTimeOptions('2026-04-05', '01:45', 'Australia/Lord_Howe').options).toEqual([
      { value: '2026-04-04T14:45:00.000Z', offset: 'UTC+11:00' },
      { value: '2026-04-04T15:15:00.000Z', offset: 'UTC+10:30' }
    ]);
  });

  it('does not interpret legacy timezone-less timestamps using the browser timezone', () => {
    expect(hasExplicitTimezone('2026-07-01T12:00:00')).toBeFalse();
    expect(storedLocalTime('2026-07-01T12:00:00', 'Europe/Berlin')).toBeNull();
  });

  it('displays the correct local date and preserves nonzero seconds', () => {
    expect(storedLocalTime('2026-07-02T02:00:15Z', 'America/New_York'))
      .toEqual({ date: '2026-07-01', time: '22:00:15' });
  });
});
