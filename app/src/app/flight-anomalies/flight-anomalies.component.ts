import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Flight } from '../models/flight';
import { FlightsService } from '../services/flights.service';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { FlightCardComponent } from '../flight-card/flight-card.component';

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

  tooSlowFlights = this.flightsService.tooSlowFlights;
  tooFastFlights = this.flightsService.tooFastFlights;
  invalidFlights = this.flightsService.invalidFlights;
  incompleteFlights = this.flightsService.incompleteFlights;
  validatedAnomalies = this.flightsService.validatedAnomalies;

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
  showValidated = signal(false);
  recalculatingFlightId = signal<string | null>(null);
  deletingFlightId = signal<string | null>(null);
  deletingAllIncomplete = signal(false);

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

    if (this.showValidated()) {
      flights = [...flights, ...this.validatedAnomalies()];
    }

    // Sort by date descending (newest first)
    return flights.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  totalAnomalies = computed(() => this.tooSlowFlights().length + this.tooFastFlights().length + this.invalidFlights().length + this.incompleteFlights().length);
  totalValidated = computed(() => this.validatedAnomalies().length);

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

  getAnomalyType(flight: Flight): 'slow' | 'fast' | 'invalid' | 'incomplete' | 'validated' {
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

  deleteFlight(flight: Flight) {
    if (flight._id && confirm('Are you sure you want to permanently delete this incomplete flight?')) {
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
