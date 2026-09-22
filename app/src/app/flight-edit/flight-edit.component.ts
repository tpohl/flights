import { Location, LocationStrategy, PathLocationStrategy, CommonModule } from '@angular/common';
import { AirportService } from '../services/airport.service';

import { Component, OnDestroy, inject, effect, ViewChild, ElementRef, signal, input, computed, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FlightStatsComponent } from '../flight-stats/flight-stats.component';
import { RelativeTimePipe } from '../pipes/relativeTimePipe';
import { FlightDistancePipe } from '../pipes/flightDistancePipe';
import { CesiumDirective } from '../cesium.directive';

import { Flight, FLIGHT_MANUAL_FIELDS, TRAVEL_CLASSES } from '../models/flight';

import DayJS from 'dayjs';

import { FlightsService, SaveResultType } from '../services/flights.service';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';

import { AuthService } from '../services/auth.service';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, map, distinctUntilChanged, take, finalize } from 'rxjs/operators';
import { forkJoin, of, Subscription } from 'rxjs';
import { hasExplicitTimezone, isFlightDate, localTimeOptions, LocalTimeOptions, storedLocalTime } from '../models/flight-times';
import { flightWriteContext } from '../services/flight-write';

// Angular Material
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

type TimeKind = 'departure' | 'arrival';

@Component({
  imports: [
    CommonModule,
    FormsModule,
    FlightTileComponent,
    FlightStatsComponent,
    RelativeTimePipe,
    FlightDistancePipe,
    CesiumDirective,
    ExactDurationPipe,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatRadioModule,
    MatDividerModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSelectModule
  ],
  selector: 'app-flight-edit',
  providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
  templateUrl: './flight-edit.component.html',
  styleUrls: ['./flight-edit.component.scss']
})
export class FlightEditComponent implements OnDestroy {

  private authService = inject(AuthService);
  protected flightsService = inject(FlightsService);
  private airportService = inject(AirportService);
  private location = inject(Location);
  private router = inject(Router);

  flightId = input<string>();
  user = this.authService.user;

  flight = signal<Flight | null>(null);
  departureTime = signal('');
  arrivalTime = signal('');
  arrivalDate = signal('');
  departureOccurrence = signal('');
  arrivalOccurrence = signal('');
  isSaving = signal(false);
  isDirty = signal(false);
  saveError = signal('');
  saveMessage = signal('');
  recordUnavailable = signal(false);
  isRecalculating = signal(false);

  private pendingChanges: Partial<Flight> = {};
  private serverFlight: Flight | null = null;
  private changedTimes = signal({ departure: false, arrival: false });
  private enteredTimes = { departure: false, arrival: false };
  private flightSubscription?: Subscription;
  private saveSubscription?: Subscription;
  private scrollTimer?: ReturnType<typeof setTimeout>;

  TRAVEL_CLASSES_LIST = Array.from(TRAVEL_CLASSES.values());

  @ViewChild('formCard', { read: ElementRef }) formCard?: ElementRef;

  fromAirport = toSignal(
    toObservable(this.flight).pipe(
      map(f => f?.from),
      distinctUntilChanged(),
      switchMap(code => code?.length === 3 ? this.airportService.loadAirport(code) : of(null))
    )
  );

  toAirport = toSignal(
    toObservable(this.flight).pipe(
      map(f => f?.to),
      distinctUntilChanged(),
      switchMap(code => code?.length === 3 ? this.airportService.loadAirport(code) : of(null))
    )
  );

  flightsForMap = computed(() => {
    const f = this.flight();
    return f?.departureTime && f.arrivalTime ? [f] : [];
  });

  departureOptions = computed(() => localTimeOptions(
    this.flight()?.date ?? '', this.departureTime(), this.fromAirport()?.timezoneId ?? ''
  ));
  departureDateValue = computed(() => {
    const date = this.flight()?.date;
    return date && isFlightDate(date) ? DayJS(date).toDate() : null;
  });
  arrivalOptions = computed(() => localTimeOptions(
    this.arrivalDate(), this.arrivalTime(), this.toAirport()?.timezoneId ?? ''
  ));

  departureWarning = computed(() => this.timeWarning(this.flight()?.departureTime, this.fromAirport()?.timezoneId));
  arrivalWarning = computed(() => this.timeWarning(this.flight()?.arrivalTime, this.toAirport()?.timezoneId));

  constructor() {
    effect(() => {
      const id = this.flightId();
      const user = this.user();
      if (user) {
        untracked(() => this.initializeFlight(id));
      }
    });

    effect(() => {
      const f = this.flight();
      const fromAp = this.fromAirport();
      if (!this.changedTimes().departure) {
        const local = storedLocalTime(f?.departureTime, fromAp?.timezoneId);
        this.departureTime.set(local?.time ?? '');
        this.departureOccurrence.set(local ? new Date(f.departureTime).toISOString() : '');
      }
    });

    effect(() => {
      const f = this.flight();
      const toAp = this.toAirport();
      if (!this.changedTimes().arrival) {
        const local = storedLocalTime(f?.arrivalTime, toAp?.timezoneId);
        this.arrivalTime.set(local?.time ?? '');
        this.arrivalDate.set(local?.date ?? f?.date ?? '');
        this.arrivalOccurrence.set(local ? new Date(f.arrivalTime).toISOString() : '');
      }
    });
  }

  ngOnDestroy(): void {
    this.flightSubscription?.unsubscribe();
    this.saveSubscription?.unsubscribe();
    clearTimeout(this.scrollTimer);
  }

  private initializeFlight(id: string | undefined) {
    this.flightSubscription?.unsubscribe();
    this.saveSubscription?.unsubscribe();
    clearTimeout(this.scrollTimer);
    this.resetDraft();
    this.serverFlight = null;
    this.flight.set(null);
    this.recordUnavailable.set(false);
    if (!id || id === 'new') {
      this.flightsService.activeFlight.set(null);
      const newFlight = new Flight();
      newFlight._id = null;
      newFlight.date = DayJS().format('YYYY-MM-DD');
      this.flight.set(newFlight);

      // Focus on the form when creating a new flight
      this.scrollTimer = setTimeout(() => {
        if (this.formCard) {
          this.formCard.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else {
      this.loadFlight(id);
    }
  }

  private resetDraft(): void {
    this.pendingChanges = {};
    this.changedTimes.set({ departure: false, arrival: false });
    this.enteredTimes = { departure: false, arrival: false };
    this.isDirty.set(false);
    this.saveError.set('');
    this.saveMessage.set('');
  }

  updateField<K extends keyof Flight>(field: K, value: Flight[K]): void {
    const f = this.flight();
    if (!f || this.isSaving() || this.isRecalculating()) return;
    this.pendingChanges = { ...this.pendingChanges, [field]: value };
    if (field === 'from') this.markTimeChanged('departure');
    if (field === 'to') this.markTimeChanged('arrival');
    this.flight.set({ ...f, [field]: value });
    this.markDirty();
  }

  updateAirport(field: 'from' | 'to', value: string): void {
    this.updateField(field, value.trim().toUpperCase());
  }

  setTime(kind: TimeKind, value: string): void {
    if (this.isSaving()) return;
    this.enteredTimes[kind] = true;
    this.markTimeChanged(kind);
    (kind === 'departure' ? this.departureTime : this.arrivalTime).set(value);
    this.markDirty();
  }

  setArrivalDate(value: string): void {
    if (this.isSaving()) return;
    this.markTimeChanged('arrival');
    this.arrivalDate.set(value);
    this.markDirty();
  }

  setOccurrence(kind: TimeKind, value: string): void {
    if (this.isSaving()) return;
    this.markTimeChanged(kind);
    (kind === 'departure' ? this.departureOccurrence : this.arrivalOccurrence).set(value);
    this.markDirty();
  }

  private markTimeChanged(kind: TimeKind): void {
    this.changedTimes.update(changed => ({ ...changed, [kind]: true }));
    (kind === 'departure' ? this.departureOccurrence : this.arrivalOccurrence).set('');
  }

  private markDirty(): void {
    this.isDirty.set(true);
    this.saveError.set('');
    this.saveMessage.set('');
  }

  private timeWarning(value: string, zone: string): string {
    if (!value) return '';
    if (!hasExplicitTimezone(value)) {
      return 'Stored time has no valid timezone. It will be preserved unless you enter a replacement.';
    }
    if (!storedLocalTime(value, zone)) return 'Airport timezone unavailable. The stored time will be preserved.';
    return '';
  }

  loadFlight(flightId: string) {
    this.flightSubscription?.unsubscribe();
    this.flightSubscription = this.flightsService.loadFlight(flightId).subscribe({
      next: flight => {
        if (!flight || flight._deleted) {
          this.recordUnavailable.set(true);
          this.saveError.set('This flight no longer exists. Your draft has not been saved.');
          return;
        }
        this.serverFlight = structuredClone(flight);
        const draft = { ...this.serverFlight, ...this.pendingChanges };
        if (this.pendingChanges.manualOverrides) {
          draft.manualOverrides = { ...this.serverFlight.manualOverrides, ...this.pendingChanges.manualOverrides };
        }
        this.flight.set(draft);
      },
      error: error => this.showError('Could not load flight', error)
    });
  }

  onDateChange(value: Date | null): void {
    const f = this.flight();
    if (!f || this.isSaving()) return;
    const date = value ? DayJS(value).format('YYYY-MM-DD') : '';
    if (date === f.date) return;
    if (isFlightDate(date) && isFlightDate(f.date) && isFlightDate(this.arrivalDate())) {
      const days = DayJS.utc(date).diff(DayJS.utc(f.date), 'day');
      this.arrivalDate.update(arrival => DayJS.utc(arrival).add(days, 'day').format('YYYY-MM-DD'));
    }
    this.markTimeChanged('departure');
    this.markTimeChanged('arrival');
    this.updateField('date', date);
  }

  autocomplete(): void {
    const flight = this.flight();
    if (this.isSaving() || this.isRecalculating() || !flight) return;
    this.updateField('needsAutocomplete', !flight.needsAutocomplete);
    this.save();
  }

  save(): void {
    const f = this.flight();
    if (!f || this.isSaving() || this.isRecalculating() || this.recordUnavailable()) return;
    if (!isFlightDate(f.date)) {
      this.saveError.set('Enter a valid departure date.');
      return;
    }
    this.isSaving.set(true);
    this.saveError.set('');
    this.saveMessage.set('');
    const changed = this.changedTimes();
    const expected = (changed.departure || changed.arrival) && this.serverFlight
      ? flightWriteContext(this.serverFlight) : undefined;
    this.saveSubscription = forkJoin({
      from: changed.departure && f.from ? this.airportService.loadAirport(f.from).pipe(take(1)) : of(null),
      to: changed.arrival && f.to ? this.airportService.loadAirport(f.to).pipe(take(1)) : of(null)
    }).pipe(
      switchMap(airports => {
        const latest = this.flight();
        if (this.recordUnavailable() || !latest ||
          (['date', 'from', 'to', 'departureTime', 'arrivalTime'] as const).some(field => latest[field] !== f[field])) {
          throw new Error('Flight details changed while preparing the save. Review the updated flight and try again.');
        }
        const changes = { ...this.pendingChanges };
        if (changed.departure) {
          const time = this.resolveTime('departure', f, airports.from?.timezoneId);
          if (time !== undefined) changes.departureTime = time;
        }
        if (changed.arrival) {
          const time = this.resolveTime('arrival', f, airports.to?.timezoneId);
          if (time !== undefined) changes.arrivalTime = time;
        }
        const candidate = { ...f, ...changes };
        if ('departureTime' in changes || 'arrivalTime' in changes) {
          if (candidate.departureTime && candidate.arrivalTime) {
            if (!hasExplicitTimezone(candidate.departureTime) || !hasExplicitTimezone(candidate.arrivalTime)) {
              throw new Error('Re-enter both local times before recalculating a flight with ambiguous timestamps.');
            }
            const duration = new Date(candidate.arrivalTime).getTime() - new Date(candidate.departureTime).getTime();
            if (duration <= 0) throw new Error('Arrival must be after departure. Check the arrival date and airport-local times.');
            changes.durationMilliseconds = duration;
          } else {
            changes.durationMilliseconds = null;
          }
        }
        const manualOverrides: NonNullable<Flight['manualOverrides']> = {};
        for (const field of FLIGHT_MANUAL_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(changes, field)) manualOverrides[field] = true;
        }
        if ('aircraftTypeCode' in changes && changes.aircraftTypeCode !== this.serverFlight?.aircraftTypeCode) {
          changes.aircraftType = '';
          manualOverrides.aircraftType = false;
        }
        if (Object.keys(manualOverrides).length) changes.manualOverrides = manualOverrides;
        this.pendingChanges = changes;
        const saved = { ...this.flight(), ...changes };
        if (changes.manualOverrides) {
          saved.manualOverrides = { ...this.flight()?.manualOverrides, ...changes.manualOverrides };
        }
        this.flight.set(saved);
        return this.flightsService.saveFlight(saved, changes, expected);
      }),
      finalize(() => this.isSaving.set(false))
    ).subscribe({
      next: result => {
        if (!result) {
          this.saveError.set('The flight was not saved. Please sign in and try again.');
          return;
        }
        this.resetDraft();
        this.flight.update(current => current ? { ...current } : current);
        this.saveMessage.set('Flight saved.');
        if (result.type === SaveResultType.CREATED) {
          this.loadFlight(result.flightId);
          this.location.replaceState('flight/' + result.flightId);
        }
      },
      error: error => this.showError('Could not save flight', error)
    });
  }

  private resolveTime(kind: TimeKind, flight: Flight, zone: string): string | undefined {
    const date = kind === 'departure' ? flight.date : this.arrivalDate();
    const time = (kind === 'departure' ? this.departureTime : this.arrivalTime)();
    const original = kind === 'departure' ? flight.departureTime : flight.arrivalTime;
    const label = kind === 'departure' ? 'Departure' : 'Arrival';
    if (!time) {
      if (original && !this.enteredTimes[kind]) {
        throw new Error(`${label}: enter a local time before changing the date or airport of an unresolved timestamp.`);
      }
      return this.enteredTimes[kind] ? '' : undefined;
    }
    const result: LocalTimeOptions = localTimeOptions(date, time, zone);
    if (result.error) throw new Error(`${label}: ${result.error}`);
    const selected = (kind === 'departure' ? this.departureOccurrence : this.arrivalOccurrence)();
    const option = result.options.length === 1 ? result.options[0] : result.options.find(o => o.value === selected);
    if (!option) throw new Error(`${label}: this time occurs twice. Choose the UTC offset.`);
    return option.value;
  }

  private showError(context: string, error: unknown): void {
    console.error(context, error);
    this.saveError.set(error instanceof Error ? `${context}: ${error.message}` : `${context}. Please try again.`);
  }

  delete(): void {
    const f = this.flight();
    if (this.isSaving()) return;
    if (f?._id) {
      this.isSaving.set(true);
      this.saveSubscription = this.flightsService.saveFlight(f, { _deleted: true }).pipe(
        finalize(() => this.isSaving.set(false))
      ).subscribe({
        next: result => {
          if (result) this.router.navigateByUrl('/flights');
          else this.saveError.set('The flight was not deleted. Please sign in and try again.');
        },
        error: error => this.showError('Could not delete flight', error)
      });
    } else {
      this.router.navigateByUrl('/flights');
    }
  }

  isFlightAnomaly(): boolean {
    const f = this.flight();
    return f ? this.flightsService.isAnomalies(f) : false;
  }

  isSlowAnomaly(): boolean {
    const f = this.flight();
    return f ? this.flightsService.isSlowAnomaly(f) : false;
  }

  isFastAnomaly(): boolean {
    const f = this.flight();
    return f ? this.flightsService.isFastAnomaly(f) : false;
  }

  isMissingData(): boolean {
    const f = this.flight();
    return f ? this.flightsService.isInvalidAnomaly(f) : false;
  }

  validateAnomaly(): void {
    const f = this.flight();
    if (f) {
      this.updateField('validatedAnomaly', !f.validatedAnomaly);
      this.save();
    }
  }

  recalculate(): void {
    const f = this.flight();
    if (f && !this.isDirty() && !this.isSaving()) {
      this.isRecalculating.set(true);
      this.saveSubscription = this.flightsService.recalculateFlightData({ ...f }).subscribe({
        next: () => {
          this.isRecalculating.set(false);
        },
        error: error => {
          this.isRecalculating.set(false);
          this.showError('Could not recalculate flight', error);
        }
      });
    }
  }
}
