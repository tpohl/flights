const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/;
const EXPLICIT_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

export type LocalTimeResolution =
  | { state: "not-local" }
  | { state: "invalid"; reason: string }
  | { state: "gap" }
  | { state: "overlap"; options: string[] }
  | { state: "resolved"; value: string; offset: string };

const formatterFor = (zone: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: zone,
  calendar: "iso8601",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

const zonedTime = (instant: number, formatter: Intl.DateTimeFormat) => {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  const date = `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
  const time = `${parts["hour"]}:${parts["minute"]}:${parts["second"]}`;
  const milliseconds = ((instant % 1000) + 1000) % 1000;
  return {
    wall: `${date}T${time}.${String(milliseconds).padStart(3, "0")}`,
    offset: parts["timeZoneName"] === "GMT" ? "UTC+00:00" : parts["timeZoneName"].replace("GMT", "UTC"),
    offsetMilliseconds: Date.parse(`${date}T${time}Z`) - Math.floor(instant / 1000) * 1000,
  };
};

export const hasExplicitTimezone = (value: unknown): value is string =>
  typeof value === "string" && EXPLICIT_ZONE.test(value) && Number.isFinite(Date.parse(value));

export const resolveLocalIso = (value: unknown, zone: unknown): LocalTimeResolution => {
  if (typeof value !== "string" || !LOCAL_ISO.test(value)) return { state: "not-local" };
  if (typeof zone !== "string" || !zone.trim()) {
    return { state: "invalid", reason: "Airport timezone is unavailable." };
  }
  const match = LOCAL_ISO.exec(value)!;
  const millisecond = (match[7] || "0").padEnd(3, "0");
  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] || "00"}` +
    `.${millisecond}`;
  const wallTime = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(wallTime) || new Date(wallTime).toISOString().slice(0, normalized.length) !== normalized) {
    return { state: "invalid", reason: "Timestamp is not a valid calendar date." };
  }
  try {
    const formatter = formatterFor(zone);
    const offsets = new Set([-2, -1, 0, 1, 2].map((days) =>
      zonedTime(wallTime + days * 86400000, formatter).offsetMilliseconds));
    const options = [...offsets].map((offset) => wallTime - offset)
      .filter((instant) => zonedTime(instant, formatter).wall === normalized)
      .sort((a, b) => a - b);
    if (!options.length) return { state: "gap" };
    if (options.length > 1) {
      return { state: "overlap", options: options.map((instant) => new Date(instant).toISOString()) };
    }
    return {
      state: "resolved",
      value: new Date(options[0]).toISOString(),
      offset: zonedTime(options[0], formatter).offset,
    };
  } catch (error) {
    if (error instanceof RangeError) return { state: "invalid", reason: `Invalid IANA timezone: ${zone}` };
    throw error;
  }
};

export const localDateInZone = (value: unknown, zone: unknown): string | null => {
  if (typeof value !== "string" || typeof zone !== "string" || !Number.isFinite(Date.parse(value))) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    return get("year") && get("month") && get("day") ?
      `${get("year")}-${get("month")}-${get("day")}` : null;
  } catch {
    return null;
  }
};
