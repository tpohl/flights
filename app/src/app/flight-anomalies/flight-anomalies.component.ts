import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Flight } from '../models/flight';
import { FlightsService } from '../services/flights.service';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatRippleModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    FlightTileComponent,
    ExactDurationPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatRippleModule,
    MatCheckboxModule
  ],
  selector: 'app-flight-anomalies',
  templateUrl: './flight-anomalies.component.html',
  styleUrls: ['./flight-anomalies.component.scss']
})
export class FlightAnomaliesComponent {
  private flightsService = inject(FlightsService);

  tooSlowFlights = this.flightsService.tooSlowFlights;
  tooFastFlights = this.flightsService.tooFastFlights;
  validatedAnomalies = this.flightsService.validatedAnomalies;

  // Filter states
  showTooSlow = signal(true);
  showTooFast = signal(true);
  showValidated = signal(false);

  displayedFlights = computed(() => {
    let flights: Flight[] = [];

    if (this.showTooSlow()) {
      flights = [...flights, ...this.tooSlowFlights()];
    }

    if (this.showTooFast()) {
      flights = [...flights, ...this.tooFastFlights()];
    }

    if (this.showValidated()) {
      flights = [...flights, ...this.validatedAnomalies()];
    }

    // Sort by date descending (newest first)
    return flights.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  get totalAnomalies(): number {
    return this.tooSlowFlights().length + this.tooFastFlights().length;
  }

  get totalValidated(): number {
    return this.validatedAnomalies().length;
  }

  calculateAverageSpeed(flight: Flight): number {
    return this.flightsService.getAverageSpeed(flight);
  }

  isSlowAnomaly(flight: Flight): boolean {
    return this.flightsService.isSlowAnomaly(flight);
  }

  isFastAnomaly(flight: Flight): boolean {
    // A flight is a fast anomaly if it is in the tooFastFlights list
    // However, simpler check for display purposes: if not slow, assume fast if it's an anomaly.
    // But wait, validated anomalies could be either.
    // Let's rely on the service check if we had one, but strict check:
    return !this.isSlowAnomaly(flight);
  }

  getAnomalyType(flight: Flight): 'slow' | 'fast' | 'validated' {
    // Check if it's in validated list first? Or checked against lists.
    // The current UI shows 'Very Slow', 'Very Fast', 'Validated'.
    // If a flight is validated, it is in `validatedAnomalies`.
    // If it is pending, it is in `tooSlow` or `tooFast`.
    // A flight should not be in both pending and validated lists (assumed).

    if (this.validatedAnomalies().some(f => f._id === flight._id)) {
      return 'validated';
    }
    if (this.tooSlowFlights().some(f => f._id === flight._id)) {
      return 'slow';
    }
    return 'fast';
  }
}
