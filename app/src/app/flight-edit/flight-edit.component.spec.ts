import { Location } from '@angular/common';
import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject, tap, throwError } from 'rxjs';
import { CesiumDirective } from '../cesium.directive';
import { FlightStatsComponent } from '../flight-stats/flight-stats.component';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { Airport } from '../models/airport';
import { Flight } from '../models/flight';
import { AirportService } from '../services/airport.service';
import { AuthService } from '../services/auth.service';
import { FlightsService, SaveResult, SaveResultType } from '../services/flights.service';
import { FlightEditComponent } from './flight-edit.component';

@Component({ selector: 'app-flight-tile', template: '' })
class FlightTileStub {
  flight = input<Flight>();
}

@Component({ selector: 'app-flight-stats', template: '' })
class FlightStatsStub {
  flight = input<Flight>();
}

@Component({ selector: 'app-cesium', template: '' })
class MapStub {
  flights = input<Flight[]>();
  timelineMode = input(false);
}

describe('FlightEditComponent', () => {
  let fixture: ComponentFixture<FlightEditComponent>;
  let component: FlightEditComponent;
  let flightsService: jasmine.SpyObj<FlightsService>;
  let airportService: jasmine.SpyObj<AirportService>;
  let server: BehaviorSubject<Flight>;
  let original: Flight;

  const airports: Record<string, Airport> = {
    BER: { code: 'BER', name: 'Berlin', timezoneId: 'Europe/Berlin', latitude: 52.36, longitude: 13.5, created: new Date() },
    SOF: { code: 'SOF', name: 'Sofia', timezoneId: 'Europe/Sofia', latitude: 42.7, longitude: 23.4, created: new Date() },
    JFK: { code: 'JFK', name: 'New York', timezoneId: 'America/New_York', latitude: 40.64, longitude: -73.78, created: new Date() },
    SYD: { code: 'SYD', name: 'Sydney', timezoneId: 'Australia/Sydney', latitude: -33.94, longitude: 151.18, created: new Date() },
    HNL: { code: 'HNL', name: 'Honolulu', timezoneId: 'Pacific/Honolulu', latitude: 21.32, longitude: -157.92, created: new Date() }
  };

  beforeEach(async () => {
    spyOn(console, 'error');
    original = Object.assign(new Flight(), {
      _id: 'flight-1',
      _objectReference: 'users/test-user/flights/flight-1',
      date: '2026-07-01',
      flightno: 'XX123',
      from: 'BER',
      to: 'SOF',
      departureTime: '2026-07-01T10:00:00Z',
      arrivalTime: '2026-07-01T12:00:00Z',
      durationMilliseconds: 7200000,
      distance: 1300,
      note: 'Original note'
    });
    server = new BehaviorSubject(original);
    const activeFlight = signal<Flight | null>(null);
    flightsService = jasmine.createSpyObj<FlightsService>('FlightsService', [
      'loadFlight', 'saveFlight', 'isAnomalies', 'isSlowAnomaly', 'isFastAnomaly',
      'isInvalidAnomaly', 'getAverageSpeed', 'recalculateFlightData'
    ], { activeFlight });
    flightsService.loadFlight.and.callFake(() => server.pipe(tap(f => activeFlight.set(f))));
    flightsService.saveFlight.and.returnValue(of({ flightId: 'flight-1', type: SaveResultType.UPDATED }));
    airportService = jasmine.createSpyObj<AirportService>('AirportService', ['loadAirport']);
    airportService.loadAirport.and.callFake(code => of(airports[String(code)] ?? null));

    await TestBed.configureTestingModule({
      imports: [FlightEditComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: AuthService, useValue: { user: signal({ uid: 'test-user' }) } },
        { provide: FlightsService, useValue: flightsService },
        { provide: AirportService, useValue: airportService }
      ],
      teardown: { destroyAfterEach: true }
    }).overrideComponent(FlightEditComponent, {
      remove: { imports: [FlightTileComponent, FlightStatsComponent, CesiumDirective] },
      add: { imports: [FlightTileStub, FlightStatsStub, MapStub] }
    }).overrideComponent(FlightEditComponent, {
      set: { providers: [{ provide: Location, useValue: jasmine.createSpyObj('Location', ['replaceState']) }] }
    }).compileComponents();

    fixture = TestBed.createComponent(FlightEditComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('flightId', 'flight-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  async function enter(selector: string, value: string) {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(selector);
    expect(input).withContext(selector).not.toBeNull();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function save() {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.save-button');
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('saves airport-local time edits using Save alone', async () => {
    await enter('input[type="time"]', '12:30');
    await save();

    const saved = flightsService.saveFlight.calls.mostRecent().args[0];
    expect(new Date(saved.departureTime).toISOString()).toBe('2026-07-01T10:30:00.000Z');
    expect(new Date(saved.arrivalTime).toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(saved.durationMilliseconds).toBe(5400000);
    const changes = flightsService.saveFlight.calls.mostRecent().args[1];
    expect(changes.manualOverrides.departureTime).toBeTrue();
    expect(changes).not.toEqual(jasmine.objectContaining({ aircraftRegistration: jasmine.anything() }));
    expect(changes.arrivalTime).toBeUndefined();
  });

  it('does not mutate the database-backed object when editing a note', async () => {
    await enter('input[placeholder="Additional notes"]', 'My draft');
    expect(original.note).toBe('Original note');
  });

  it('keeps unsaved edits while accepting unrelated background updates', async () => {
    await enter('input[placeholder="Additional notes"]', 'My draft');
    server.next({ ...original, aircraftRegistration: 'D-TEST' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.flight()?.note).toBe('My draft');
    expect(component.flight()?.aircraftRegistration).toBe('D-TEST');
  });

  it('does not reset an edited clock when background data arrives', async () => {
    await enter('input[type="time"]', '12:30');
    server.next({ ...original, aircraftRegistration: 'D-TEST' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.departureTime()).toBe('12:30');
    await save();
    expect(new Date(flightsService.saveFlight.calls.mostRecent().args[0].departureTime).toISOString())
      .toBe('2026-07-01T10:30:00.000Z');
  });

  it('surfaces a failed save and retains the draft for retry', async () => {
    flightsService.saveFlight.and.returnValue(throwError(() => new Error('Write denied')));
    await enter('input[placeholder="Additional notes"]', 'My draft');
    await save();
    expect(fixture.nativeElement.textContent).toContain('Write denied');
    expect(component.flight()?.note).toBe('My draft');
  });

  it('does not turn missing times into midnight when saving other fields', async () => {
    server.next({ ...original, departureTime: '', arrivalTime: '', durationMilliseconds: 0 });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.departureTime()).toBe('');
    expect(component.arrivalTime()).toBe('');
    await enter('input[placeholder="Additional notes"]', 'No known times');
    await save();
    const saved = flightsService.saveFlight.calls.mostRecent().args[0];
    expect(saved.departureTime).toBeFalsy();
    expect(saved.arrivalTime).toBeFalsy();
  });

  it('clears the duration when a user explicitly clears a clock', async () => {
    await enter('input[name="departureTime"]', '');
    await save();
    const changes = flightsService.saveFlight.calls.mostRecent().args[1];
    expect(changes.departureTime).toBe('');
    expect(changes.durationMilliseconds).toBeNull();
    expect(changes.manualOverrides.departureTime).toBeTrue();
  });

  it('uses the explicit arrival date for an overnight flight', async () => {
    await enter('input[name="arrivalDate"]', '2026-07-02');
    await enter('input[name="arrivalTime"]', '01:00');
    await save();
    expect(flightsService.saveFlight.calls.mostRecent().args[0].arrivalTime).toBe('2026-07-01T22:00:00.000Z');
  });

  it('preserves a previous-day local arrival when crossing the date line', async () => {
    server.next({
      ...original, from: 'SYD', to: 'HNL', date: '2026-07-02',
      departureTime: '2026-07-01T23:00:00Z', arrivalTime: '2026-07-02T09:00:00Z'
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.arrivalDate()).toBe('2026-07-01');
    await enter('input[name="arrivalTime"]', '23:15');
    await save();
    expect(flightsService.saveFlight.calls.mostRecent().args[0].arrivalTime).toBe('2026-07-02T09:15:00.000Z');
  });

  it('moves both timestamps when changing the departure date', async () => {
    component.onDateChange(new Date(2026, 6, 2));
    fixture.detectChanges();
    await fixture.whenStable();
    await save();
    const saved = flightsService.saveFlight.calls.mostRecent().args[0];
    expect(saved.departureTime).toBe('2026-07-02T10:00:00.000Z');
    expect(saved.arrivalTime).toBe('2026-07-02T12:00:00.000Z');
  });

  it('uses the newly entered airport timezone without an intermediate save', async () => {
    await enter('input[placeholder="Origin (e.g. VIE)"]', 'jfk');
    await enter('input[name="arrivalTime"]', '23:00');
    await save();
    const saved = flightsService.saveFlight.calls.mostRecent().args[0];
    expect(saved.from).toBe('JFK');
    expect(saved.departureTime).toBe('2026-07-01T16:00:00.000Z');
    expect(saved.arrivalTime).toBe('2026-07-01T20:00:00.000Z');
  });

  it('rejects arrival before departure instead of silently adding a day', async () => {
    await enter('input[name="arrivalTime"]', '10:00');
    await save();
    expect(flightsService.saveFlight).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Arrival must be after departure');
  });

  it('requires a timezone for an edited time but preserves unresolved times on unrelated saves', async () => {
    airportService.loadAirport.and.returnValue(of(null));
    await enter('input[name="departureTime"]', '12:30');
    await save();
    expect(flightsService.saveFlight).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('timezone is unavailable');
  });

  it('preserves legacy timezone-less values on note-only saves', async () => {
    server.next({ ...original, departureTime: '2026-07-01T10:00:00' });
    fixture.detectChanges();
    await fixture.whenStable();
    await enter('input[placeholder="Additional notes"]', 'Keep original time');
    await save();
    const [saved, changes] = flightsService.saveFlight.calls.mostRecent().args;
    expect(saved.departureTime).toBe('2026-07-01T10:00:00');
    expect(changes.departureTime).toBeUndefined();
  });

  it('requires an explicit offset when the edited time occurs twice', async () => {
    server.next({
      ...original, date: '2026-10-25',
      departureTime: '2026-10-25T00:00:00Z', arrivalTime: '2026-10-25T04:00:00Z'
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await enter('input[name="departureTime"]', '02:30');
    await save();
    expect(flightsService.saveFlight).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Choose the UTC offset');
    component.setOccurrence('departure', '2026-10-25T01:30:00.000Z');
    await save();
    expect(flightsService.saveFlight.calls.mostRecent().args[0].departureTime).toBe('2026-10-25T01:30:00.000Z');
  });

  it('blocks duplicate saves until the current write completes', async () => {
    const response = new Subject<SaveResult>();
    flightsService.saveFlight.and.returnValue(response);
    component.save();
    component.save();
    expect(flightsService.saveFlight).toHaveBeenCalledTimes(1);
    response.next({ flightId: 'flight-1', type: SaveResultType.UPDATED });
    response.complete();
    expect(component.isSaving()).toBeFalse();
  });

  it('does not save a flight removed while the editor is open', async () => {
    await enter('input[placeholder="Additional notes"]', 'My draft');
    server.next({ ...original, _deleted: true });
    fixture.detectChanges();
    await fixture.whenStable();
    component.save();
    expect(flightsService.saveFlight).not.toHaveBeenCalled();
    expect(component.flight()?.note).toBe('My draft');
    expect(component.saveError()).toContain('no longer exists');
  });

  it('starts with blank clocks and can create a flight using only date and number', async () => {
    fixture.componentRef.setInput('flightId', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.departureTime()).toBe('');
    expect(component.arrivalTime()).toBe('');
    flightsService.saveFlight.and.callFake(saved => {
      server.next({ ...saved, _id: 'created-flight' });
      return of({ flightId: 'created-flight', type: SaveResultType.CREATED });
    });
    await enter('input[placeholder="e.g. LH123"]', 'XX456');
    await save();
    expect(flightsService.saveFlight.calls.mostRecent().args[0].departureTime).toBeFalsy();
    expect(component.flight()?._id).toBe('created-flight');
  });

  it('does not protect untouched unknown times when entering a date and airports', async () => {
    fixture.componentRef.setInput('flightId', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    component.onDateChange(new Date(2025, 6, 2));
    await enter('input[placeholder="Origin (e.g. VIE)"]', 'BER');
    await enter('input[placeholder="Destination (e.g. HAM)"]', 'SOF');
    await enter('input[placeholder="e.g. LH123"]', 'XX456');
    await save();
    const [saved, changes] = flightsService.saveFlight.calls.mostRecent().args;
    expect(saved.departureTime).toBeUndefined();
    expect(saved.arrivalTime).toBeUndefined();
    expect(changes.manualOverrides.departureTime).toBeUndefined();
    expect(changes.manualOverrides.arrivalTime).toBeUndefined();
    expect(changes.manualOverrides.from).toBeTrue();
  });

  it('drops the old flight subscription when navigating to a new record', async () => {
    fixture.componentRef.setInput('flightId', 'new');
    fixture.detectChanges();
    await fixture.whenStable();
    server.next({ ...original, note: 'Late update from old record' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.flight()?._id).toBeNull();
    expect(component.flight()?.note).not.toBe('Late update from old record');
  });
});
