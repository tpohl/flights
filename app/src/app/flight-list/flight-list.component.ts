import { Flight } from './../models/flight';
import { Component, Signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FlightsService } from '../services/flights.service';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';
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
import { MatRippleModule } from '@angular/material/core';

@Component({
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ExactDurationPipe,
    FlightTileComponent,
    CesiumDirective,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    FlightCardComponent,
    FlightSummaryCardComponent
  ],
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.scss']
})
export class FlightListComponent {
  private flightsService = inject(FlightsService);

  flights: Signal<Flight[]> = this.flightsService.flights;
  stats: Signal<OverallStats> = this.flightsService.stats;

  mapOptions: MapOptions = {
    flights: true,
    countries: true
  };

  selectFlight(flight: Flight) {
    this.flightsService.selectFlight(flight);
  }
}

interface MapOptions {
  flights: boolean;
  countries: boolean;
}

