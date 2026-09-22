import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Flight } from '../models/flight';
import { FlightsService } from '../services/flights.service';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { FlightCardComponent } from '../flight-card/flight-card.component';
import { Airport } from '../models/airport';
import { AirportService } from '../services/airport.service';
import { assessMyFlightradar24Export } from '../services/myflightradar24';
import { forkJoin, map, of, switchMap, take, timeout, finalize } from 'rxjs';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    FlightTileComponent,
    FlightCardComponent,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  selector: 'app-flight-anomalies',
  templateUrl: './flight-anomalies.component.html',
  styleUrls: ['./flight-anomalies.component.scss']
})
export class FlightAnomaliesComponent {
  private flightsService = inject(FlightsService);
  private airportService = inject(AirportService);

  tooSlowFlights = this.flightsService.tooSlowFlights;
  tooFastFlights = this.flightsService.tooFastFlights;
  invalidFlights = this.flightsService.invalidFlights;
  incompleteFlights = this.flightsService.incompleteFlights;
  validatedAnomalies = this.flightsService.validatedAnomalies;
  myFlightradar24Anomalies = toSignal(
    toObservable(this.flightsService.allFlightsIncludingInvalidAndDeleted).pipe(
      switchMap(flights => {
        const active = flights.filter(flight => !flight._deleted);
        const codes = [...new Set(active.flatMap(flight => [flight.from, flight.to]).filter(Boolean))];
        const airports$ = codes.length
          ? forkJoin(codes.map(code => this.airportService.loadAirport(code).pipe(
            take(1),
            map(airport => [code, airport] as const)
          )))
          : of([]);
        return airports$.pipe(map(entries => {
          const airportEntries = entries as readonly (readonly [string, Airport | null])[];
          const airports = new Map(airportEntries.filter(
            (entry): entry is readonly [string, Airport] => !!entry[1]
          ));
          return active
            .map(flight => ({ flight, assessment: assessMyFlightradar24Export(flight, airports) }))
            .filter(item => !item.assessment.eligible);
        }));
      })
    ),
    { initialValue: [] }
  );

  // Filter states - using model for 2-way binding support if needed, 
  // though model() is typically for component inputs.
  // For local state with 2-way binding, standard signals with separate bindings 
  // or model() if we want to expose them as inputs.
  // Let's use standard signals and fix the template if needed, 
  // or just use model() if we want to allow parent components to control them.
  // Since these are internal filters, signal() is fine but we need to call it in template.

  showTooSlow = signal(true);
  showTooFast = signal(true);
  showInvalid = signal(true);
  showIncomplete = signal(false);
  showMyFlightradar24 = signal(true);
  showValidated = signal(false);
  recalculatingFlightId = signal<string | null>(null);
  autocompletingFlightId = signal<string | null>(null);
  deletingFlightId = signal<string | null>(null);
  deletingAllIncomplete = signal(false);

  databaseFlights = computed(() => [...this.flightsService.allFlightsIncludingInvalidAndDeleted()]
    .filter(flight => !flight._deleted)
    .sort((a, b) => this.flightDate(b) - this.flightDate(a)));

  displayedFlights = computed(() => {
    let flights: Flight[] = [];

    if (this.showTooSlow()) {
      flights = [...flights, ...this.tooSlowFlights()];
    }

    if (this.showTooFast()) {
      flights = [...flights, ...this.tooFastFlights()];
    }

    if (this.showInvalid()) {
      flights = [...flights, ...this.invalidFlights()];
    }

    if (this.showIncomplete()) {
      flights = [...flights, ...this.incompleteFlights()];
    }

    if (this.showMyFlightradar24()) {
      flights = [...flights, ...this.myFlightradar24Anomalies().map(item => item.flight)];
    }

    if (this.showValidated()) {
      flights = [...flights, ...this.validatedAnomalies()];
    }

    // Sort by date descending (newest first)
    return [...new Map(flights.map(flight => [flight._id, flight])).values()]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  totalAnomalies = computed(() => new Set([
    ...this.tooSlowFlights(), ...this.tooFastFlights(), ...this.invalidFlights(),
    ...this.incompleteFlights(), ...this.myFlightradar24Anomalies().map(item => item.flight)
  ].map(flight => flight._id)).size);
  totalValidated = computed(() => this.validatedAnomalies().length);

  previousFlight(flight: Flight): Flight | null {
    const flights = this.databaseFlights();
    const index = flights.findIndex(item => item._id === flight._id);
    return index >= 0 && index < flights.length - 1 ? flights[index + 1] : null;
  }

  nextFlight(flight: Flight): Flight | null {
    const flights = this.databaseFlights();
    const index = flights.findIndex(item => item._id === flight._id);
    return index > 0 ? flights[index - 1] : null;
  }

  private flightDate(flight: Flight): number {
    const value = flight.departureTime || flight.date;
    return value ? new Date(value).getTime() : Number.MIN_SAFE_INTEGER;
  }

  calculateAverageSpeed(flight: Flight): number {
    return this.flightsService.getAverageSpeed(flight);
  }

  isSlowAnomaly(flight: Flight): boolean {
    return this.flightsService.isSlowAnomaly(flight);
  }

  isFastAnomaly(flight: Flight): boolean {
    return this.flightsService.isFastAnomaly(flight);
  }

  isInvalidAnomaly(flight: Flight): boolean {
    return this.flightsService.isInvalidAnomaly(flight);
  }

  isIncompleteAnomaly(flight: Flight): boolean {
    return !flight.departureTime || !flight.from || !flight.to;
  }

  myFlightradar24Issues(flight: Flight): string[] {
    return this.myFlightradar24Anomalies()
      .find(item => item.flight._id === flight._id)?.assessment.reasons ?? [];
  }

  getAnomalyType(flight: Flight): 'slow' | 'fast' | 'invalid' | 'incomplete' | 'myflightradar24' | 'validated' {
    if (this.myFlightradar24Anomalies().some(item => item.flight._id === flight._id)) {
      return 'myflightradar24';
    }
    if (this.validatedAnomalies().some(f => f._id === flight._id)) {
      return 'validated';
    }
    if (this.incompleteFlights().some(f => f._id === flight._id)) {
      return 'incomplete';
    }
    if (this.invalidFlights().some(f => f._id === flight._id)) {
      return 'invalid';
    }
    if (this.tooSlowFlights().some(f => f._id === flight._id)) {
      return 'slow';
    }
    return 'fast';
  }

  isMissingData(flight: Flight): boolean {
    return !flight.durationMilliseconds || flight.durationMilliseconds <= 0 || !flight.distance || flight.distance <= 0;
  }

  recalculate(flight: Flight) {
    if (flight._id) {
      this.recalculatingFlightId.set(flight._id);
      this.flightsService.recalculateFlightData(flight).subscribe({
        next: () => this.recalculatingFlightId.set(null),
        error: () => this.recalculatingFlightId.set(null)
      });
    }
  }

  autocomplete(flight: Flight) {
    if (!flight._id || this.autocompletingFlightId() === flight._id) {
      return;
    }

    const flightId = flight._id;
    const resetQueuedRequest = flight.needsAutocomplete
      ? this.flightsService.saveFlight(flight, { needsAutocomplete: false })
      : of(null);

    this.autocompletingFlightId.set(flightId);
    resetQueuedRequest.pipe(
      switchMap(() => {
        flight.needsAutocomplete = true;
        return this.flightsService.saveFlight(flight, { needsAutocomplete: true });
      }),
      timeout({ first: 30_000 }),
      finalize(() => this.autocompletingFlightId.set(null))
    ).subscribe({
      error: () => {
        flight.needsAutocomplete = false;
      }
    });
  }

  deleteFlight(flight: Flight) {
    if (flight._id && confirm('Are you sure you want to permanently delete this flight?')) {
      this.deletingFlightId.set(flight._id);
      this.flightsService.deleteFlight(flight).subscribe({
        next: () => this.deletingFlightId.set(null),
        error: () => this.deletingFlightId.set(null)
      });
    }
  }

  deleteAllIncompleteFlights() {
    const incompleteCount = this.incompleteFlights().length;
    if (incompleteCount === 0) {
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to permanently delete all ${incompleteCount} incomplete flight${incompleteCount > 1 ? 's' : ''}?`
    );

    if (confirmed) {
      this.deletingAllIncomplete.set(true);
      this.flightsService.deleteAllIncompleteFlights().subscribe({
        next: () => this.deletingAllIncomplete.set(false),
        error: () => this.deletingAllIncomplete.set(false)
      });
    }
  }
}
