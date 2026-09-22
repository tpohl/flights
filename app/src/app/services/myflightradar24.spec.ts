import { Airport } from '../models/airport';
import { Flight } from '../models/flight';
import {
  assessMyFlightradar24Export, exportMyFlightradar24, extractAirportIata, MYFR24_HEADERS, MYFR24_HEADER_LINE, parseCsv,
  previewMyFlightradar24Import, writeCsv
} from './myflightradar24';

describe('myFlightradar24 CSV', () => {
  const airport = (code: string, name: string, timezoneId: string) =>
    ({ code, name, timezoneId } as Airport);
  const airports = new Map<string, Airport>([
    ['BER', airport('BER', 'Berlin Brandenburg', 'Europe/Berlin')],
    ['LHR', airport('LHR', 'London Heathrow', 'Europe/London')],
    ['JFK', airport('JFK', 'John F Kennedy', 'America/New_York')],
    ['HNL', airport('HNL', 'Honolulu', 'Pacific/Honolulu')],
    ['SYD', airport('SYD', 'Sydney', 'Australia/Sydney')]
  ]);
  const values = (overrides: Record<string, string> = {}) => ({
    Date: '2024-01-10',
    'Flight number': 'LH-123',
    From: 'Berlin (BER/EDDB)',
    To: 'London (LHR/EGLL)',
    'Dep time': '10:00:00',
    'Arr time': '10:55:00',
    Duration: '01:55:00',
    Airline: 'Lufthansa (LH/DLH)',
    Aircraft: 'Airbus A321 (A321)',
    Registration: 'D-AABC',
    'Seat number': '12A',
    'Seat type': '1',
    'Flight class': '4',
    'Flight reason': '2',
    Note: 'comma, quote " and\nnewline',
    Dep_id: '', Arr_id: '', Airline_id: '', Aircraft_id: '',
    ...overrides
  });
  const csv = (overrides: Record<string, string> = {}, headers: readonly string[] = MYFR24_HEADERS) => {
    const record = values(overrides);
    return writeCsv(headers, [headers.map(header => record[header] ?? 'extra')]);
  };

  it('parses BOM, reordered headers, harmless extras, quotes and embedded newlines', () => {
    const headers = ['Extra', ...[...MYFR24_HEADERS].reverse()];
    const table = parseCsv(`\ufeff\n${csv({}, headers)}`);
    expect(table.headers).toEqual(headers);
    expect(table.rows[0].values[headers.indexOf('Note')]).toBe('comma, quote " and\nnewline');
  });

  it('rejects missing, duplicate, malformed and inconsistent CSV with row details', () => {
    expect(() => parseCsv('Date,Date\r\nx,x\r\n')).toThrowError(/Duplicate CSV header/);
    expect(() => parseCsv('Date\r\nx\r\n')).toThrowError(/Missing required CSV columns/);
    expect(() => parseCsv(csv().replace('"comma, quote "" and\nnewline"', '"unclosed')))
      .toThrowError(/unclosed quoted field/);
    expect(() => parseCsv(csv() + 'too,few\r\n')).toThrowError(/row 3.*2 columns/i);
  });

  it('writes CRLF RFC4180 and protects formulas without losing imported text', () => {
    const protectedCsv = csv({ Note: '  =SUM(1,2)', Registration: '+cmd' });
    expect(protectedCsv).toContain('"\'  =SUM(1,2)"');
    expect(protectedCsv).toContain("'+cmd");
    const preview = previewMyFlightradar24Import(protectedCsv, airports, []);
    expect(preview.rows[0].flight?.note).toBe('  =SUM(1,2)');
    expect(preview.rows[0].flight?.aircraftRegistration).toBe('+cmd');
    expect(protectedCsv).toContain('\r\n');
  });

  it('round-trips formula-like text and literal apostrophes without source-key collisions', () => {
    const formulaNote = '=CONCAT("quoted",\n"line")';
    const literalNote = '\'=CONCAT("quoted",\n"line")';
    const formulaCsv = csv({ Note: formulaNote, Registration: '+cmd' });
    const literalCsv = csv({ Note: literalNote, Registration: '\'+cmd' });

    expect(formulaCsv).toContain('"\'=CONCAT(""quoted"",\n""line"")"');
    expect(literalCsv).toContain('"\'\'=CONCAT(""quoted"",\n""line"")"');
    expect(formulaCsv).toContain("'+cmd");
    expect(literalCsv).toContain("''+cmd");

    const formula = previewMyFlightradar24Import(formulaCsv, airports, []).rows[0];
    const literal = previewMyFlightradar24Import(literalCsv, airports, []).rows[0];
    expect(formula.flight?.note).toBe(formulaNote);
    expect(literal.flight?.note).toBe(literalNote);
    expect(formula.flight?.aircraftRegistration).toBe('+cmd');
    expect(literal.flight?.aircraftRegistration).toBe('\'+cmd');
    expect(formula.sourceKey).not.toBe(literal.sourceKey);
  });

  it('extracts supported airport representations', () => {
    expect(extractAirportIata('Hamburg / Fuhlsbuttel (HAM/EDDH)')).toBe('HAM');
    expect(extractAirportIata('Hamburg (HAM)')).toBe('HAM');
    expect(extractAirportIata('ham')).toBe('HAM');
    expect(extractAirportIata('Hamburg')).toBeNull();
  });

  it('maps normalized fields and all enums including private', () => {
    const preview = previewMyFlightradar24Import(csv({
      'Flight class': '5', 'Flight reason': '3', 'Seat type': '3'
    }), airports, [], '2026-09-11T12:00:00.000Z');
    const flight = preview.rows[0].flight!;
    expect(preview.summary).toEqual({ total: 1, ready: 1, duplicate: 0, invalid: 0 });
    expect(flight.flightno).toBe('LH123');
    expect(flight.class).toBe('V');
    expect(flight.reason).toBe('C');
    expect(flight.seatType).toBe('A');
    expect(flight.carrier).toBe('Lufthansa');
    expect(flight.aircraftType).toBe('Airbus A321');
    expect(flight.aircraftTypeCode).toBe('A321');
    expect(flight.importMetadata?.source).toBe('myflightradar24');
    expect(flight.needsAutocomplete).toBeFalse();
  });

  it('infers overnight and date-line arrival dates from duration', () => {
    const overnight = previewMyFlightradar24Import(csv({
      From: 'BER', To: 'JFK', 'Dep time': '20:00:00', 'Arr time': '22:00:00', Duration: '08:00:00'
    }), airports, []);
    expect(overnight.rows[0].flight?.arrivalTime).toBe('2024-01-11T03:00:00.000Z');

    const dateLine = previewMyFlightradar24Import(csv({
      Date: '2024-01-10', From: 'HNL', To: 'SYD',
      'Dep time': '10:00:00', 'Arr time': '18:00:00', Duration: '11:00:00'
    }), airports, []);
    expect(dateLine.rows[0].flight?.departureTime).toBe('2024-01-10T20:00:00.000Z');
    expect(dateLine.rows[0].flight?.arrivalTime).toBe('2024-01-11T07:00:00.000Z');
  });

  it('uses duration to resolve a DST overlap and rejects unresolved gaps/ambiguity', () => {
    const resolved = previewMyFlightradar24Import(csv({
      Date: '2024-10-27', From: 'BER', To: 'LHR',
      'Dep time': '02:30:00', 'Arr time': '02:30:00', Duration: '02:00:00'
    }), airports, []);
    expect(resolved.rows[0].status).toBe('ready');
    expect(resolved.rows[0].flight?.departureTime).toBe('2024-10-27T00:30:00.000Z');

    const gap = previewMyFlightradar24Import(csv({
      Date: '2024-03-31', From: 'BER', To: 'LHR',
      'Dep time': '02:30:00', 'Arr time': '04:30:00', Duration: '03:00:00'
    }), airports, []);
    expect(gap.rows[0].status).toBe('invalid');
    expect(gap.rows[0].errors.join(' ')).toContain('No plausible arrival date');
  });

  it('reports field errors, duplicate source rows, and existing duplicates', () => {
    const invalid = previewMyFlightradar24Import(csv({
      Date: 'bad', 'Flight number': 'bad!', From: 'missing', Duration: 'nope'
    }), airports, []);
    expect(invalid.rows[0].status).toBe('invalid');
    expect(invalid.rows[0].errors.length).toBeGreaterThan(3);

    const record = values();
    const row = MYFR24_HEADERS.map(header => record[header]);
    const repeated = writeCsv(MYFR24_HEADERS, [row, row]);
    const duplicateSource = previewMyFlightradar24Import(repeated, airports, []);
    expect(duplicateSource.rows[1].errors).toContain('Duplicate source row in this file.');

    const flight = previewMyFlightradar24Import(csv(), airports, []).rows[0].flight!;
    const existing = previewMyFlightradar24Import(csv(), airports, [{ ...flight, _id: 'stored' }]);
    expect(existing.rows[0].status).toBe('duplicate');
    const equivalentOffset = previewMyFlightradar24Import(csv(), airports, [{
      ...flight, _id: 'stored', departureTime: '2024-01-10T10:00:00+01:00'
    }]);
    expect(equivalentOffset.rows[0].status).toBe('duplicate');
  });

  it('exports deterministically, skips deleted/incomplete, and preserves complex notes on round trip', () => {
    const ready = previewMyFlightradar24Import(csv(), airports, []).rows[0].flight!;
    const earlier = { ...ready, _id: '2', flightno: 'BA10', date: '2024-01-09',
      departureTime: '2024-01-09T09:00:00.000Z', arrivalTime: '2024-01-09T10:00:00.000Z',
      durationMilliseconds: 3600000 };
    const result = exportMyFlightradar24([
      ready, { ...ready, _id: 'deleted', _deleted: true },
      { ...ready, _id: 'incomplete', arrivalTime: '' }, earlier
    ], airports);
    expect(result.exported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.csv.split('\r\n')[0]).toBe(MYFR24_HEADER_LINE);
    expect(result.csv.indexOf('BA10')).toBeLessThan(result.csv.indexOf('LH123'));
    const roundTrip = previewMyFlightradar24Import(result.csv, airports, []);
    expect(roundTrip.rows.find(row => row.flight?.flightno === 'LH123')?.flight?.note)
      .toBe('comma, quote " and\nnewline');
  });

  it('formats durations longer than 24 hours', () => {
    const flight = previewMyFlightradar24Import(csv(), airports, []).rows[0].flight!;
    const result = exportMyFlightradar24([{ ...flight, durationMilliseconds: 90061000 }], airports);
    expect(result.csv).toContain('25:01:01');
  });

  it('reports the exact reasons a flight cannot be exported', () => {
    const assessment = assessMyFlightradar24Export({
      flightno: 'bad!',
      from: 'XXX',
      to: 'LHR',
      departureTime: '',
      arrivalTime: '',
      durationMilliseconds: 0
    } as Flight, airports);
    expect(assessment.eligible).toBeFalse();
    expect(assessment.reasons).toEqual([
      'Enter a valid flight number.',
      'Add timezone data for XXX.',
      'Add a valid departure time.',
      'Add a valid arrival time.',
      'Add a valid positive duration.'
    ]);
  });

  it('uses the same readiness assessment as export', () => {
    const flight = previewMyFlightradar24Import(csv(), airports, []).rows[0].flight!;
    expect(assessMyFlightradar24Export(flight, airports).eligible).toBeTrue();
    expect(exportMyFlightradar24([flight], airports)).toEqual(jasmine.objectContaining({
      exported: 1,
      skipped: 0
    }));
  });
});
