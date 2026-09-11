import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

export interface LocalTimeOption {
  value: string;
  offset: string;
}

export interface LocalTimeOptions {
  options: LocalTimeOption[];
  error?: string;
}

export function isFlightDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dayjs.utc(value).isValid() && dayjs.utc(value).format('YYYY-MM-DD') === value;
}

export function hasExplicitTimezone(value: string | null | undefined): boolean {
  return !!value && /(Z|[+-]\d{2}:?\d{2})$/i.test(value) && dayjs(value).isValid();
}

function zoneFormatter(zone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, calendar: 'iso8601', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    timeZoneName: 'longOffset'
  });
}

function zonedTime(instant: number, formatter: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
  const date = `${parts['year']}-${parts['month']}-${parts['day']}`;
  const time = `${parts['hour']}:${parts['minute']}:${parts['second']}`;
  return {
    date, time,
    offset: parts['timeZoneName'] === 'GMT' ? 'UTC+00:00' : parts['timeZoneName'].replace('GMT', 'UTC'),
    offsetMilliseconds: Date.parse(`${date}T${time}Z`) - Math.floor(instant / 1000) * 1000
  };
}

export function storedLocalTime(value: string | null | undefined, zone: string | null | undefined): { date: string; time: string } | null {
  if (!hasExplicitTimezone(value) || !zone) return null;
  try {
    const local = zonedTime(new Date(value).getTime(), zoneFormatter(zone));
    return {
      date: local.date,
      time: local.time.endsWith(':00') ? local.time.slice(0, 5) : local.time
    };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export function localTimeOptions(date: string, time: string, zone: string): LocalTimeOptions {
  if (!time) return { options: [] };
  if (!isFlightDate(date)) return { options: [], error: 'Enter a valid local date.' };
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) {
    return { options: [], error: 'Enter a valid time.' };
  }
  if (!zone) return { options: [], error: 'The airport timezone is unavailable.' };

  const localTime = time.length === 5 ? `${time}:00` : time;
  const wallTime = Date.parse(`${date}T${localTime}Z`);
  try {
    const formatter = zoneFormatter(zone);
    // Enumerate nearby offsets instead of silently guessing during a DST overlap.
    const offsets = new Set([-2, -1, 0, 1, 2].map(days => zonedTime(wallTime + days * 86400000, formatter).offsetMilliseconds));
    const options = [...offsets].map(offset => wallTime - offset)
      .filter(instant => {
        const local = zonedTime(instant, formatter);
        return local.date === date && local.time === localTime;
      })
      .sort((a, b) => a - b)
      .map(instant => ({ value: new Date(instant).toISOString(), offset: zonedTime(instant, formatter).offset }));
    return options.length ? { options } : {
      options: [], error: 'This local time does not exist because the clocks change. Choose a valid time.'
    };
  } catch (error) {
    if (error instanceof RangeError) {
      return { options: [], error: `The airport timezone "${zone}" is invalid.` };
    }
    throw error;
  }
}
