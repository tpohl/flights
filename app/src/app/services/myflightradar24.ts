import { Airport } from '../models/airport';
import { Flight } from '../models/flight';
import { hasExplicitTimezone, isFlightDate, localTimeOptions, storedLocalTime } from '../models/flight-times';

export const MYFR24_HEADERS = [
  'Date', 'Flight number', 'From', 'To', 'Dep time', 'Arr time', 'Duration',
  'Airline', 'Aircraft', 'Registration', 'Seat number', 'Seat type',
  'Flight class', 'Flight reason', 'Note', 'Dep_id', 'Arr_id', 'Airline_id', 'Aircraft_id'
] as const;
export const MYFR24_HEADER_LINE =
  'Date,"Flight number",From,To,"Dep time","Arr time",Duration,Airline,Aircraft,Registration,' +
  '"Seat number","Seat type","Flight class","Flight reason",Note,Dep_id,Arr_id,Airline_id,Aircraft_id';

type Header = typeof MYFR24_HEADERS[number];
export type MyFr24Record = Record<Header, string>;

export interface CsvTable {
  headers: string[];
  rows: { rowNumber: number; values: string[] }[];
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: 'ready' | 'duplicate' | 'invalid';
  flight?: Flight;
  sourceKey?: string;
  errors: string[];
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  summary: { total: number; ready: number; duplicate: number; invalid: number };
}

export interface MyFr24Export {
  csv: string;
  exported: number;
  skipped: number;
}

export interface MyFr24ExportAssessment {
  eligible: boolean;
  reasons: string[];
  departure?: { date: string; time: string };
  arrival?: { date: string; time: string };
  durationMilliseconds?: number;
}

const DANGEROUS_CELL = /^\s*[=+\-@]/;
const EMITTED_FORMULA_PREFIX = /^'(\s*[=+\-@])/;
const ESCAPED_LITERAL_APOSTROPHE_PREFIX = /^''(\s*[=+\-@])/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

export function parseCsv(input: string): CsvTable {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (afterQuote) {
      if (char !== ',' && char !== '\r' && char !== '\n') {
        throw new Error(`Malformed CSV at row ${records.length + 1}: unexpected character after closing quote.`);
      }
      afterQuote = false;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === '"') {
      throw new Error(`Malformed CSV at row ${records.length + 1}: quote inside an unquoted field.`);
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error(`Malformed CSV at row ${records.length + 1}: unclosed quoted field.`);
  if (field.length || record.length) {
    record.push(field);
    records.push(record);
  }
  while (records.length && records[0].every(value => value === '')) records.shift();
  while (records.length && records.at(-1)!.every(value => value === '')) records.pop();
  if (!records.length) throw new Error('The CSV file is empty.');

  const headers = records[0].map(value => value.trim());
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) {
    throw new Error(`Duplicate CSV header: ${[...new Set(duplicateHeaders)].join(', ')}.`);
  }
  const missing = MYFR24_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new Error(`Missing required CSV columns: ${missing.join(', ')}.`);

  const rows = records.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${index + 2} has ${values.length} columns; expected ${headers.length}.`);
    }
    return { rowNumber: index + 2, values };
  });
  return { headers, rows };
}

function safeCell(value: unknown): string {
  const stringValue = value == null ? '' : String(value);
  if (EMITTED_FORMULA_PREFIX.test(stringValue)) return `'${stringValue}`;
  return DANGEROUS_CELL.test(stringValue) ? `'${stringValue}` : stringValue;
}

function quoteCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function writeCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [headers, ...rows]
    .map(row => row.map(value => quoteCsv(safeCell(value))).join(','))
    .join('\r\n') + '\r\n';
}

function importedCell(value: string): string {
  // This reverses files exported by this app; an arbitrary external leading apostrophe
  // remains inherently ambiguous unless it uses the doubled-apostrophe convention.
  if (ESCAPED_LITERAL_APOSTROPHE_PREFIX.test(value)) {
    return value.replace(ESCAPED_LITERAL_APOSTROPHE_PREFIX, '\'$1');
  }
  return value.replace(EMITTED_FORMULA_PREFIX, '$1');
}

export function extractAirportIata(value: string): string | null {
  const normalized = importedCell(value).trim().toUpperCase();
  const slash = normalized.match(/\(([A-Z]{3})\/[A-Z0-9]{3,4}\)\s*$/);
  if (slash) return slash[1];
  const parentheses = normalized.match(/\(([A-Z]{3})\)\s*$/);
  if (parentheses) return parentheses[1];
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function normalizeFlightNumber(value: string): string | null {
  const normalized = importedCell(value).toUpperCase().replace(/[\s-]+/g, '');
  return /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(normalized) ? normalized : null;
}

function parseDuration(value: string): number | null {
  const match = importedCell(value).trim().match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  if (!match) return null;
  const duration = (+match[1] * 3600 + +match[2] * 60 + +match[3]) * 1000;
  return duration > 0 ? duration : null;
}

function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function sourceKey(record: MyFr24Record): string {
  const canonical = MYFR24_HEADERS.map(header => importedCell(record[header]).trim()).join('\u001f');
  let hashA = 2166136261;
  let hashB = 3339675911;
  for (let i = 0; i < canonical.length; i++) {
    hashA = Math.imul(hashA ^ canonical.charCodeAt(i), 16777619);
    hashB = Math.imul(hashB ^ canonical.charCodeAt(i), 2246822519);
  }
  return `myfr24-${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`;
}

export function flightDuplicateKey(flight: Partial<Flight>): string {
  const base = [
    flight.date?.trim(), flight.flightno?.replace(/[\s-]+/g, '').toUpperCase(),
    flight.from?.toUpperCase(), flight.to?.toUpperCase()
  ].join('|');
  const instant = flight.departureTime && !Number.isNaN(Date.parse(flight.departureTime))
    ? new Date(flight.departureTime).toISOString()
    : flight.departureTime;
  return instant ? `${base}|${instant}` : base;
}

export function flightsAreDuplicates(left: Partial<Flight>, right: Partial<Flight>): boolean {
  const leftBase = flightDuplicateKey({ ...left, departureTime: undefined });
  const rightBase = flightDuplicateKey({ ...right, departureTime: undefined });
  return leftBase === rightBase &&
    (!left.departureTime || !right.departureTime || flightDuplicateKey(left) === flightDuplicateKey(right));
}

function displayBeforeCodes(value: string): string {
  return importedCell(value).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function aircraftParts(value: string): { name: string; code: string } {
  const clean = importedCell(value).trim();
  const match = clean.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return match ? { name: match[1].trim(), code: match[2].trim().toUpperCase() } : {
    name: clean, code: /^[A-Z0-9]{2,5}$/i.test(clean) ? clean.toUpperCase() : ''
  };
}

function rowRecord(table: CsvTable, values: string[]): MyFr24Record {
  return Object.fromEntries(MYFR24_HEADERS.map(header => [
    header, values[table.headers.indexOf(header)]
  ])) as MyFr24Record;
}

export function previewMyFlightradar24Import(
  csv: string,
  airports: ReadonlyMap<string, Airport>,
  existingFlights: readonly Flight[],
  importedAt = new Date().toISOString()
): ImportPreview {
  const table = parseCsv(csv);
  const seenSources = new Set<string>();
  const rows = table.rows.map(({ rowNumber, values }): ImportPreviewRow => {
    const record = rowRecord(table, values);
    const errors: string[] = [];
    const date = importedCell(record.Date).trim();
    const flightno = normalizeFlightNumber(record['Flight number']);
    const from = extractAirportIata(record.From);
    const to = extractAirportIata(record.To);
    const depTime = importedCell(record['Dep time']).trim();
    const arrTime = importedCell(record['Arr time']).trim();
    const durationMilliseconds = parseDuration(record.Duration);
    const key = sourceKey(record);

    if (seenSources.has(key)) errors.push('Duplicate source row in this file.');
    seenSources.add(key);
    if (!isFlightDate(date)) errors.push('Date must be a real YYYY-MM-DD date.');
    if (!flightno) errors.push('Flight number must contain a 2-character designator, 1-4 digits, and optional suffix.');
    if (!from) errors.push('From must contain a valid 3-letter IATA code.');
    if (!to) errors.push('To must contain a valid 3-letter IATA code.');
    if (!TIME.test(depTime)) errors.push('Dep time must be HH:mm:ss.');
    if (!TIME.test(arrTime)) errors.push('Arr time must be HH:mm:ss.');
    if (!durationMilliseconds) errors.push('Duration must be a positive HH:mm:ss value.');

    const fromAirport = from ? airports.get(from) : null;
    const toAirport = to ? airports.get(to) : null;
    if (from && (!fromAirport || !fromAirport.timezoneId)) errors.push(`Airport ${from} is missing or has no timezone.`);
    if (to && (!toAirport || !toAirport.timezoneId)) errors.push(`Airport ${to} is missing or has no timezone.`);

    let departureTime = '';
    let arrivalTime = '';
    if (!errors.length && fromAirport && toAirport && durationMilliseconds) {
      const departures = localTimeOptions(date, depTime, fromAirport.timezoneId);
      const candidates = departures.options.flatMap(dep => [-1, 0, 1, 2].flatMap(day =>
        localTimeOptions(addDays(date, day), arrTime, toAirport.timezoneId).options
          .filter(arr => {
            const elapsed = Date.parse(arr.value) - Date.parse(dep.value);
            return elapsed > 0 && Math.abs(elapsed - durationMilliseconds) <= 60000;
          })
          .map(arr => ({ departure: dep.value, arrival: arr.value }))
      ));
      const unique = [...new Map(candidates.map(candidate => [
        `${candidate.departure}|${candidate.arrival}`, candidate
      ])).values()];
      if (unique.length !== 1) {
        errors.push(unique.length
          ? 'Local times are ambiguous across timezone/DST offsets; manual review is required.'
          : 'No plausible arrival date matches the supplied duration; manual review is required.');
      } else {
        departureTime = unique[0].departure;
        arrivalTime = unique[0].arrival;
      }
    }

    if (errors.length) return { rowNumber, status: 'invalid', sourceKey: key, errors };

    const aircraft = aircraftParts(record.Aircraft);
    const seatTypes: Record<string, string> = { '1': 'W', '2': 'M', '3': 'A' };
    const classes: Record<string, string> = { '1': 'Y', '2': 'C', '3': 'F', '4': 'M', '5': 'V' };
    const reasons: Record<string, string> = { '1': 'L', '2': 'B', '3': 'C', '4': 'O' };
    const flight = {
      _id: null, date, flightno: flightno!, from: from!, to: to!,
      departureTime, arrivalTime, durationMilliseconds,
      carrier: displayBeforeCodes(record.Airline),
      aircraftType: aircraft.name, aircraftTypeCode: aircraft.code,
      aircraftRegistration: importedCell(record.Registration).trim(),
      seat: importedCell(record['Seat number']).trim(),
      seatType: seatTypes[record['Seat type'].trim()] || '',
      class: classes[record['Flight class'].trim()] || '',
      reason: reasons[record['Flight reason'].trim()] || '',
      note: importedCell(record.Note),
      needsAutocomplete: false,
      importMetadata: { source: 'myflightradar24' as const, sourceKey: key, importedAt }
    } as Flight;
    const duplicate = existingFlights.some(existing => !existing._deleted && flightsAreDuplicates(flight, existing));
    return { rowNumber, status: duplicate ? 'duplicate' : 'ready', flight, sourceKey: key, errors: [] };
  });
  return {
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter(row => row.status === 'ready').length,
      duplicate: rows.filter(row => row.status === 'duplicate').length,
      invalid: rows.filter(row => row.status === 'invalid').length
    }
  };
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  return `${String(hours).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function assessMyFlightradar24Export(
  flight: Flight,
  airports: ReadonlyMap<string, Airport>
): MyFr24ExportAssessment {
  const reasons: string[] = [];
  const normalizedFlightNumber = normalizeFlightNumber(flight.flightno || '');
  if (!normalizedFlightNumber) reasons.push('Enter a valid flight number.');
  if (!flight.from) reasons.push('Add the origin airport.');
  if (!flight.to) reasons.push('Add the destination airport.');

  const fromAirport = flight.from ? airports.get(flight.from) : undefined;
  const toAirport = flight.to ? airports.get(flight.to) : undefined;
  if (flight.from && !fromAirport?.timezoneId) {
    reasons.push(`Add timezone data for ${flight.from}.`);
  }
  if (flight.to && !toAirport?.timezoneId) {
    reasons.push(`Add timezone data for ${flight.to}.`);
  }

  const departure = storedLocalTime(flight.departureTime, fromAirport?.timezoneId);
  const arrival = storedLocalTime(flight.arrivalTime, toAirport?.timezoneId);
  if (!hasExplicitTimezone(flight.departureTime) ||
      (fromAirport?.timezoneId && !departure)) {
    reasons.push('Add a valid departure time.');
  }
  if (!hasExplicitTimezone(flight.arrivalTime) ||
      (toAirport?.timezoneId && !arrival)) {
    reasons.push('Add a valid arrival time.');
  }

  const derivedDuration = flight.departureTime && flight.arrivalTime
    ? Date.parse(flight.arrivalTime) - Date.parse(flight.departureTime)
    : 0;
  const durationMilliseconds = flight.durationMilliseconds || derivedDuration;
  if (!Number.isFinite(durationMilliseconds) || durationMilliseconds <= 0) {
    reasons.push('Add a valid positive duration.');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    ...(departure ? { departure } : {}),
    ...(arrival ? { arrival } : {}),
    ...(durationMilliseconds > 0 && Number.isFinite(durationMilliseconds) ? { durationMilliseconds } : {})
  };
}

export function exportMyFlightradar24(
  flights: readonly Flight[],
  airports: ReadonlyMap<string, Airport>
): MyFr24Export {
  const rows: string[][] = [];
  const active = flights.filter(flight => !flight._deleted).sort((a, b) =>
    (a.date || '').localeCompare(b.date || '') ||
    (a.departureTime || '').localeCompare(b.departureTime || '') ||
    (a.flightno || '').localeCompare(b.flightno || '')
  );
  let skipped = 0;
  for (const flight of active) {
    const fromAirport = airports.get(flight.from);
    const toAirport = airports.get(flight.to);
    const assessment = assessMyFlightradar24Export(flight, airports);
    if (!assessment.eligible) {
      skipped++;
      continue;
    }
    const dep = assessment.departure!;
    const arr = assessment.arrival!;
    const duration = assessment.durationMilliseconds!;
    const seatTypes: Record<string, string> = { W: '1', M: '2', A: '3' };
    const classes: Record<string, string> = { Y: '1', C: '2', F: '3', M: '4', V: '5' };
    const reasons: Record<string, string> = { L: '1', B: '2', C: '3', O: '4' };
    const designator = normalizeFlightNumber(flight.flightno)?.slice(0, 2) || '';
    rows.push([
      dep.date, flight.flightno,
      fromAirport?.name ? `${fromAirport.name} (${flight.from})` : flight.from,
      toAirport?.name ? `${toAirport.name} (${flight.to})` : flight.to,
      dep.time.length === 5 ? `${dep.time}:00` : dep.time,
      arr.time.length === 5 ? `${arr.time}:00` : arr.time,
      formatDuration(duration),
      flight.carrier ? `${flight.carrier}${designator ? ` (${designator})` : ''}` : designator,
      flight.aircraftType && flight.aircraftTypeCode
        ? `${flight.aircraftType} (${flight.aircraftTypeCode})`
        : flight.aircraftTypeCode || flight.aircraftType || '',
      flight.aircraftRegistration || '', flight.seat || '', seatTypes[flight.seatType] || '',
      classes[flight.class] || '', reasons[flight.reason] || '', flight.note || '',
      '', '', '', ''
    ]);
  }
  const generated = writeCsv(MYFR24_HEADERS, rows);
  return {
    csv: MYFR24_HEADER_LINE + generated.slice(generated.indexOf('\r\n')),
    exported: rows.length,
    skipped
  };
}
