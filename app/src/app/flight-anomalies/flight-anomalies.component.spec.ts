import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AirportService } from '../services/airport.service';
import { FlightsService } from '../services/flights.service';
import { FlightAnomaliesComponent } from './flight-anomalies.component';

describe('FlightAnomaliesComponent', () => {
  let fixture: ComponentFixture<FlightAnomaliesComponent>;
  const incompleteExport = {
    _id: 'missing-arrival',
    date: '2026-09-21',
    flightno: 'LH123',
    from: 'FRA',
    to: 'JFK',
    departureTime: '2026-09-21T08:00:00Z',
    arrivalTime: '',
    durationMilliseconds: 0
  };
  const flights = signal([incompleteExport]);
  const flightsService = {
    allFlightsIncludingInvalidAndDeleted: flights,
    tooSlowFlights: signal<any[]>([]),
    tooFastFlights: signal<any[]>([]),
    invalidFlights: signal<any[]>([]),
    incompleteFlights: signal<any[]>([]),
    validatedAnomalies: signal<any[]>([]),
    getAverageSpeed: () => 0,
    isSlowAnomaly: () => false,
    isFastAnomaly: () => false,
    isInvalidAnomaly: () => false
  };
  const airportService = {
    loadAirport: (code: string) => of({
      code,
      name: code,
      timezoneId: code === 'FRA' ? 'Europe/Berlin' : 'America/New_York'
    })
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlightAnomaliesComponent],
      providers: [
        provideRouter([]),
        { provide: FlightsService, useValue: flightsService },
        { provide: AirportService, useValue: airportService }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(FlightAnomaliesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows export-incomplete flights with actionable reasons', () => {
    const component = fixture.componentInstance;
    expect(component.myFlightradar24Anomalies().length).toBe(1);
    expect(component.displayedFlights().map(flight => flight._id)).toEqual(['missing-arrival']);
    expect(component.myFlightradar24Issues(incompleteExport as any)).toContain('Add a valid arrival time.');
    expect(fixture.nativeElement.textContent).toContain('Not exportable to myFlightradar24');
    expect(fixture.nativeElement.textContent).toContain('Add a valid arrival time.');
  });

  it('does not duplicate a flight that belongs to multiple anomaly categories', () => {
    flightsService.invalidFlights.set([incompleteExport]);
    flightsService.validatedAnomalies.set([incompleteExport]);
    fixture.detectChanges();
    expect(fixture.componentInstance.displayedFlights().length).toBe(1);
    expect(fixture.componentInstance.getAnomalyType(incompleteExport as any)).toBe('myflightradar24');
  });
});
