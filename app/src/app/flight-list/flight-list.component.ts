import { Flight } from './../models/flight';
import { Component, Signal, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FlightsService } from '../services/flights.service';
import { TripsService } from '../services/trips.service';

import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { OverallStats } from '../models/stats';
import { CesiumDirective } from '../cesium.directive';
import { FlightSummaryCardComponent } from '../flight-summary-card/flight-summary-card.component';
import { FlightCardComponent } from '../flight-card/flight-card.component';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatRippleModule } from '@angular/material/core';

@Component({
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,

    FlightTileComponent,
    CesiumDirective,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatFormFieldModule,
    FlightCardComponent,
    FlightSummaryCardComponent
  ],
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.scss']
})
export class FlightListComponent {
  private flightsService = inject(FlightsService);
  private tripsService = inject(TripsService);

  allFlights: Signal<Flight[]> = this.flightsService.flights;
  stats: Signal<OverallStats> = this.flightsService.stats;

  selectedTripId = signal<string>('all');

  // Build a map of tripId -> tripName for quick lookup
  tripNameMap = computed(() => {
    const map = new Map<string, string>();
    for (const trip of this.tripsService.trips()) {
      map.set(trip._id, trip.name);
    }
    return map;
  });

  trips = this.tripsService.trips;

  // Filtered flights based on selected trip
  flights = computed(() => {
    const tripId = this.selectedTripId();
    const all = this.allFlights();
    if (tripId === 'all') return all;
    if (tripId === 'none') return all.filter(f => !f.tripId);
    return all.filter(f => f.tripId === tripId);
  });

  mapOptions: MapOptions = {
    flights: true,
    countries: true
  };

  getTripName(flight: Flight): string | undefined {
    if (!flight.tripId) return undefined;
    return this.tripNameMap().get(flight.tripId);
  }

  selectFlight(flight: Flight) {
    this.flightsService.selectFlight(flight);
  }
}

interface MapOptions {
  flights: boolean;
  countries: boolean;
}
