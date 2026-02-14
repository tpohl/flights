import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { TripsService } from '../services/trips.service';
import { FlightsService } from '../services/flights.service';
import { CesiumDirective } from '../cesium.directive';
import { FlightCardComponent } from '../flight-card/flight-card.component';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { Flight } from '../models/flight';
import { Trip } from '../models/trip';

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    RouterLink,
    CesiumDirective,
    FlightCardComponent,
    FlightTileComponent
  ],
  templateUrl: './trip-detail.component.html',
  styleUrl: './trip-detail.component.css'
})
export class TripDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tripsService = inject(TripsService);
  private flightsService = inject(FlightsService);

  tripId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))));

  trip = computed(() => {
    const id = this.tripId();
    if (!id) return undefined;
    return this.tripsService.trips().find(t => t._id === id);
  });

  flights = computed(() => {
    const id = this.tripId();
    if (!id) return [];
    return this.flightsService.flights()
      .filter(f => f.tripId === id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });

  otherTrips = computed(() => {
    const id = this.tripId();
    return this.tripsService.trips().filter(t => t._id !== id);
  });

  // Flights not in this trip but within ±3 days of the trip's date range
  suggestedFlights = computed(() => {
    const tripFlights = this.flights();
    const tripId = this.tripId();
    if (!tripId || tripFlights.length === 0) return [];

    // Find the date range of the trip
    const dates = tripFlights.map(f => new Date(f.date).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const buffer = 3 * 24 * 60 * 60 * 1000; // 3 days in ms

    return this.flightsService.flights()
      .filter(f => {
        if (f.tripId === tripId) return false; // Already in this trip
        if (!f.date) return false;
        const fDate = new Date(f.date).getTime();
        return fDate >= (minDate - buffer) && fDate <= (maxDate + buffer);
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });

  isEditing = signal(false);
  editName = signal('');
  isMerging = signal(false);
  selectedMergeTargetId = signal<string | null>(null);

  startRename() {
    const trip = this.trip();
    if (trip) {
      this.editName.set(trip.name);
      this.isEditing.set(true);
    }
  }

  cancelRename() {
    this.isEditing.set(false);
    this.editName.set('');
  }

  async saveRename() {
    const trip = this.trip();
    const newName = this.editName().trim();
    if (!trip || !newName) {
      this.cancelRename();
      return;
    }

    const success = await this.tripsService.updateTripName(trip, newName);
    if (success) {
      this.isEditing.set(false);
      // If merge happened, the trip may have been deleted — navigate back
      const stillExists = this.tripsService.trips().find(t => t._id === trip._id);
      if (!stillExists) {
        this.router.navigate(['/trips']);
      }
    }
  }

  async removeFlightFromTrip(flight: Flight) {
    if (confirm(`Remove "${flight.from} → ${flight.to}" from this trip?`)) {
      flight.tripId = '';
      await firstValueFrom(this.flightsService.saveFlight(flight));
    }
  }

  async addFlightToTrip(flight: Flight) {
    flight.tripId = this.tripId()!;
    await firstValueFrom(this.flightsService.saveFlight(flight));
  }

  startMerge() {
    this.isMerging.set(true);
    this.selectedMergeTargetId.set(null);
  }

  cancelMerge() {
    this.isMerging.set(false);
    this.selectedMergeTargetId.set(null);
  }

  async executeMerge() {
    const trip = this.trip();
    const targetId = this.selectedMergeTargetId();
    if (!trip || !targetId) return;

    const targetTrip = this.tripsService.trips().find(t => t._id === targetId);
    if (!targetTrip) return;

    if (confirm(`Merge all flights from "${trip.name}" into "${targetTrip.name}"? This trip will be deleted.`)) {
      await this.tripsService.mergeTrips(trip, targetTrip);
      this.router.navigate(['/trips', targetId]);
    }
  }
}
