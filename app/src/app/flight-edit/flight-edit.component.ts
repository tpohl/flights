import { Location, LocationStrategy, PathLocationStrategy, CommonModule } from '@angular/common';
import { AirportService } from '../services/airport.service';

import { Component, OnDestroy, OnInit, inject, effect, ViewChild, ElementRef, signal, input, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FlightStatsComponent } from '../flight-stats/flight-stats.component';
import { RelativeTimePipe } from '../pipes/relativeTimePipe';
import { FlightDistancePipe } from '../pipes/flightDistancePipe';
import { CesiumDirective } from '../cesium.directive';

import { Flight, TRAVEL_CLASSES } from '../models/flight';

import DayJS from 'dayjs';
import DayJSUtc from 'dayjs/plugin/utc';
import DayJSTimezone from 'dayjs/plugin/timezone';

import { FlightsService, SaveResultType } from '../services/flights.service';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';

import { AuthService } from '../services/auth.service';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, filter, map } from 'rxjs/operators';
import { of } from 'rxjs';

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

DayJS.extend(DayJSUtc);
DayJS.extend(DayJSTimezone);

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
    MatProgressSpinnerModule
  ],
  selector: 'app-flight-edit',
  providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
  templateUrl: './flight-edit.component.html',
  styleUrls: ['./flight-edit.component.scss']
})
export class FlightEditComponent {

  private authService = inject(AuthService);
  protected flightsService = inject(FlightsService);
  private airportService = inject(AirportService);
  private location = inject(Location);
  private router = inject(Router);

  flightId = input<string>();
  user = this.authService.user;

  flight = signal<Flight | null>(null);
  objectRef = signal<string | undefined>(undefined);

  departureTime = signal('00:00');
  arrivalTime = signal('00:00');
  isRecalculating = signal(false);

  TRAVEL_CLASSES_LIST = Array.from(TRAVEL_CLASSES.values());

  @ViewChild('formCard', { read: ElementRef }) formCard?: ElementRef;

  fromAirport = toSignal(
    toObservable(this.flight).pipe(
      switchMap(f => (f?.from && f.from.length === 3) ? this.airportService.loadAirport(f.from) : of(null))
    )
  );

  toAirport = toSignal(
    toObservable(this.flight).pipe(
      switchMap(f => (f?.to && f.to.length === 3) ? this.airportService.loadAirport(f.to) : of(null))
    )
  );

  flightsForMap = computed(() => {
    const f = this.flight();
    return f ? [f] : [];
  });

  constructor() {
    effect(() => {
      const id = this.flightId();
      const user = this.user();
      if (user) {
        this.initializeFlight(id);
      }
    });

    effect(() => {
      const active = this.flightsService.activeFlight();
      if (active) {
        this.flight.set(active);
        this.objectRef.set(active._objectReference);
      }
    });

    // Update times when airport changes or flight times change
    effect(() => {
      const f = this.flight();
      const fromAp = this.fromAirport();
      if (f?.departureTime && fromAp?.timezoneId) {
        this.departureTime.set(DayJS(f.departureTime).tz(fromAp.timezoneId).format('HH:mm'));
      }
    });

    effect(() => {
      const f = this.flight();
      const toAp = this.toAirport();
      if (f?.arrivalTime && toAp?.timezoneId) {
        this.arrivalTime.set(DayJS(f.arrivalTime).tz(toAp.timezoneId).format('HH:mm'));
      }
    });
  }

  private initializeFlight(id: string | undefined) {
    if (!id || id === 'new') {
      this.flightsService.activeFlight.set(null);
      this.objectRef.set(undefined);
      const newFlight = new Flight();
      newFlight._id = null;
      newFlight.date = DayJS().format('YYYY-MM-DD');
      this.flight.set(newFlight);

      // Focus on the form when creating a new flight
      setTimeout(() => {
        if (this.formCard) {
          this.formCard.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else {
      this.loadFlight(id);
    }
  }

  selectDepartureTime() {
    const f = this.flight();
    const ap = this.fromAirport();
    if (f && ap?.timezoneId) {
      const time = this.departureTime();
      const dateWithTime = DayJS(f.date).format('YYYY-MM-DD') + 'T' + time;
      f.departureTime = DayJS.tz(dateWithTime, ap.timezoneId).tz('UTC').format();
      this.flight.set({ ...f });
    }
  }

  selectArrivalTime() {
    const f = this.flight();
    const ap = this.toAirport();
    if (f && ap?.timezoneId) {
      const time = this.arrivalTime();
      const dateWithTime = DayJS(f.date).format('YYYY-MM-DD') + 'T' + time;
      let arrival = DayJS.tz(dateWithTime, ap.timezoneId).tz('UTC');

      if (arrival.format() < f.departureTime) {
        arrival = arrival.add(1, 'days');
      }

      f.arrivalTime = arrival.format();
      this.flight.set({ ...f });
    }
  }

  loadFlight(flightId: string) {
    this.flightsService.loadFlight(flightId).subscribe(
      (flight) => {
        if (!flight) {
          console.error('Flight not found: ' + flightId);
          this.router.navigateByUrl('/flights');
        }
      }
    );
  }

  onDateChange(event: any): void {
    const f = this.flight();
    if (f && event.value) {
      f.date = DayJS(event.value).format('YYYY-MM-DD');
      this.flight.set({ ...f });
    }
  }

  autocomplete(): void {
    const f = this.flight();
    if (f) {
      f.needsAutocomplete = !f.needsAutocomplete;
      this.flight.set({ ...f });
      this.save();
    }
  }

  save(): void {
    const f = this.flight();
    if (f) {
      this.flightsService.saveFlight(f).subscribe(result => {
        if (result && result.type === SaveResultType.CREATED) {
          const flightId = result.flightId;
          this.loadFlight(flightId);
          this.location.replaceState('flight/' + flightId);
        }
      });
    }
  }

  delete(): void {
    const f = this.flight();
    const ref = this.objectRef();
    if (f && ref) {
      f._deleted = true;
      this.flightsService.saveFlight(f).subscribe(() => {
        this.router.navigateByUrl('/flights');
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
      f.validatedAnomaly = !f.validatedAnomaly;
      this.flight.set({ ...f });
      this.save();
    }
  }

  recalculate(): void {
    const f = this.flight();
    if (f) {
      this.isRecalculating.set(true);
      this.flightsService.recalculateFlightData(f).subscribe({
        next: () => {
          this.isRecalculating.set(false);
          this.flight.set({ ...f }); // Force update signals
        },
        error: () => this.isRecalculating.set(false)
      });
    }
  }
}

