import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { RouterLink, Router } from '@angular/router';
import { TripsService } from '../services/trips.service';
import { FlightsService } from '../services/flights.service';
import { Trip } from '../models/trip';
import { Flight, TRAVEL_CLASSES } from '../models/flight';
import { firstValueFrom } from 'rxjs';

export interface ReasonInfo {
  label: string;
  icon: string;
}

export const REASON_MAP: Map<string, ReasonInfo> = new Map([
  ['B', { label: 'Work', icon: 'work' }],
  ['L', { label: 'Leisure', icon: 'beach_access' }],
  ['C', { label: 'Crew', icon: 'badge' }],
  ['O', { label: 'Other', icon: 'more_horiz' }],
]);

export interface TripInfo {
  trip: Trip;
  startDate: Date | null;
  endDate: Date | null;
  totalDistance: number;
  flightCount: number;
  airports: string[];
  airlines: string[];
  aircraftTypes: string[];
  travelClasses: string[];
  reasons: string[];
}

@Component({
  selector: 'app-trip-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatDialogModule,
    MatTooltipModule,
    MatChipsModule,
    RouterLink,
    DatePipe,
    DecimalPipe
  ],
  templateUrl: './trip-list.component.html',
  styleUrl: './trip-list.component.scss',
})
export class TripListComponent {
  private tripsService = inject(TripsService);
  private flightsService = inject(FlightsService);
  private router = inject(Router);

  trips = this.tripsService.trips;
  editingTripId = signal<string | null>(null);
  editName = signal('');

  tripInfos = computed<TripInfo[]>(() => {
    const trips = this.trips();
    const allFlights = this.flightsService.flights();

    return trips.map(trip => {
      const tripFlights = allFlights.filter(f => f.tripId === trip._id);
      const dates = tripFlights
        .filter(f => f.date)
        .map(f => new Date(f.date).getTime());

      const airports = new Set<string>();
      const airlines = new Set<string>();
      const aircraftTypes = new Set<string>();
      const travelClasses = new Set<string>();
      const reasons = new Set<string>();

      tripFlights.forEach(f => {
        if (f.from) airports.add(f.from);
        if (f.to) airports.add(f.to);
        if (f.carrier) airlines.add(f.carrier);
        if (f.aircraftType) aircraftTypes.add(f.aircraftType);
        if (f.class) travelClasses.add(f.class);
        if (f.reason) reasons.add(f.reason);
      });

      const totalDistance = tripFlights.reduce((sum, f) => sum + (f.distance || 0), 0);

      return {
        trip,
        startDate: dates.length > 0 ? new Date(Math.min(...dates)) : null,
        endDate: dates.length > 0 ? new Date(Math.max(...dates)) : null,
        totalDistance,
        flightCount: tripFlights.length,
        airports: Array.from(airports),
        airlines: Array.from(airlines),
        aircraftTypes: Array.from(aircraftTypes),
        travelClasses: Array.from(travelClasses),
        reasons: Array.from(reasons)
      };
    });
  });

  startEdit(trip: Trip) {
    this.editingTripId.set(trip._id);
    this.editName.set(trip.name);
  }

  cancelEdit() {
    this.editingTripId.set(null);
    this.editName.set('');
  }

  async saveEdit(trip: Trip) {
    const newName = this.editName();
    if (!newName || newName === trip.name) {
      this.cancelEdit();
      return;
    }

    const success = await this.tripsService.updateTripName(trip, newName);
    if (success) {
      this.cancelEdit();
    } else {
      alert('Failed to update trip name.');
    }
  }

  async deleteTrip(trip: Trip) {
    if (confirm(`Are you sure you want to delete trip "${trip.name}"? Flights will be kept but untracked from this trip.`)) {
      await firstValueFrom(this.tripsService.deleteTrip(trip._id));
    }
  }

  openTrip(tripId: string) {
    if (this.editingTripId()) return;
    this.router.navigate(['/trips', tripId]);
  }

  airportImageUrl(code: string): string {
    return `https://flights-media.pohl.rocks/media/airport/image/${code}`;
  }

  getClassLabel(key: string): string {
    return TRAVEL_CLASSES.get(key)?.short ?? key;
  }

  getClassCss(key: string): string {
    return TRAVEL_CLASSES.get(key)?.cssClass ?? '';
  }

  getReasonInfo(key: string): ReasonInfo {
    return REASON_MAP.get(key) ?? { label: key, icon: 'label' };
  }
}
