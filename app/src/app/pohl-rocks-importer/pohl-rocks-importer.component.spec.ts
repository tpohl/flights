import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AirportService } from '../services/airport.service';
import { FlightsService } from '../services/flights.service';
import { MYFR24_HEADERS, writeCsv } from '../services/myflightradar24';
import { PohlRocksImporterComponent } from './pohl-rocks-importer.component';

describe('PohlRocksImporterComponent', () => {
  let component: PohlRocksImporterComponent;
  let fixture: ComponentFixture<PohlRocksImporterComponent>;
  let flightsService: jasmine.SpyObj<FlightsService>;

  const csv = writeCsv(MYFR24_HEADERS, [[
    '2024-01-10', 'LH123', 'Berlin (BER)', 'London (LHR)', '10:00:00', '10:55:00',
    '01:55:00', 'Lufthansa (LH)', 'Airbus A321 (A321)', 'D-AABC', '12A', '1',
    '1', '1', 'note', '', '', '', ''
  ]]);

  beforeEach(async () => {
    flightsService = jasmine.createSpyObj<FlightsService>(
      'FlightsService', ['bulkImportMyFlightradar24'],
      { allFlightsIncludingInvalidAndDeleted: signal([]) }
    );
    flightsService.bulkImportMyFlightradar24.and.returnValue(of({
      imported: 1, skipped: 0, flightIds: ['new']
    }));
    const airportService = jasmine.createSpyObj<AirportService>('AirportService', ['loadAirport']);
    airportService.loadAirport.and.callFake((code: String) => of({
      code: String(code), name: String(code),
      timezoneId: code === 'BER' ? 'Europe/Berlin' : 'Europe/London',
      latitude: 0, longitude: 0, created: new Date()
    }));
    await TestBed.configureTestingModule({
      imports: [PohlRocksImporterComponent],
      providers: [
        { provide: FlightsService, useValue: flightsService },
        { provide: AirportService, useValue: airportService }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(PohlRocksImporterComponent);
    component = fixture.componentInstance;
  });

  it('previews without writing and imports only after the explicit second action', () => {
    component.csvText.set(csv);
    component.parseFlights();
    expect(component.preview()?.summary.ready).toBe(1);
    expect(flightsService.bulkImportMyFlightradar24).not.toHaveBeenCalled();

    component.importFlights();
    expect(flightsService.bulkImportMyFlightradar24).toHaveBeenCalledTimes(1);
    expect(component.result()).toContain('Imported 1 flight');
  });

  it('blocks a double click while the atomic import is running', () => {
    const pending = new Subject<any>();
    flightsService.bulkImportMyFlightradar24.and.returnValue(pending);
    component.csvText.set(csv);
    component.parseFlights();
    component.importFlights();
    component.importFlights();
    expect(flightsService.bulkImportMyFlightradar24).toHaveBeenCalledTimes(1);
    pending.next({ imported: 1, skipped: 0, flightIds: ['new'] });
    pending.complete();
  });

  it('shows parse and import failures without writing invalid rows', () => {
    component.csvText.set('not,csv');
    component.parseFlights();
    fixture.detectChanges();
    expect(component.error()).toContain('Missing required CSV columns');
    expect(fixture.nativeElement.textContent).toContain('Missing required CSV columns');
    component.importFlights();
    expect(flightsService.bulkImportMyFlightradar24).not.toHaveBeenCalled();
  });
});
