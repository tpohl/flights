import { Component, Signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Flight, TRAVEL_CLASSES } from '../models/flight';
import { OverallStats } from '../models/stats';
import { FlightsService } from '../services/flights.service';
import { CommonModule } from '@angular/common';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';
import { LogoPipe } from '../pipes/logo.pipe';
import { CoordinatePipe } from '../pipes/coordinate.pipe';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { flightDistance } from '../pipes/flightDistancePipe';
import { FlightSummaryCardComponent } from '../flight-summary-card/flight-summary-card.component';

@Component({
  selector: 'app-overall-stats',
  imports: [
    CommonModule,
    ExactDurationPipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatDividerModule,
    MatChipsModule,
    MatButtonModule,
    MatMenuModule,
    FlightSummaryCardComponent,
    LogoPipe,
    CoordinatePipe
  ],
  templateUrl: './overall-stats.component.html',
  styleUrl: './overall-stats.component.scss'
})
export class OverallStatsComponent {

  private flightsService = inject(FlightsService);

  flights: Signal<Flight[]> = this.flightsService.flights;
  stats: Signal<OverallStats> = this.flightsService.stats;
  availableYears: Signal<number[]> = this.flightsService.availableYears;
  selectedYear: Signal<number | null> = this.flightsService.selectedYear;

  setYear(year: number | null) {
    this.flightsService.selectedYear.set(year);
  }

  getSpeed(flight: Flight | null): number {
    if (!flight || !flight.durationMilliseconds || flight.durationMilliseconds === 0) return 0;
    return flightDistance(flight) / (flight.durationMilliseconds / 3600000);
  }

  getRouteLabel(route: string): string {
    return route.replace('-', ' ↔ ');
  }

  getClassLabel(seatClass: string): string {
    return TRAVEL_CLASSES.get(seatClass)?.short || seatClass || 'Other';
  }

  getClassCss(seatClass: string): string {
    return TRAVEL_CLASSES.get(seatClass)?.cssClass || '';
  }

  getPercentage(value: number, total: number): number {
    if (!total || total === 0) return 0;
    return (value / total) * 100;
  }
}
