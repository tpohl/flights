import { Flight } from './../models/flight';
import { Component, OnInit, Signal, inject } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { FlightsService } from '../services/flights.service';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { OverallStats } from '../models/stats';
import { CesiumDirective } from '../cesium.directive';
import { FlightSummaryCardComponent } from '../flight-summary-card/flight-summary-card.component';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRippleModule } from '@angular/material/core';

@Component({
  standalone: true,
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
    MatSlideToggleModule,
    MatRippleModule,
    FlightSummaryCardComponent
  ],
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.scss']
})
export class FlightListComponent implements OnInit {
  private flightsService = inject(FlightsService);

  // https://angularfirebase.com/lessons/infinite-scroll-with-firebase-data-and-angular-animation/
  flights: Signal<Flight[]> = this.flightsService.flights;

  stats: Signal<OverallStats> = this.flightsService.stats;
  mapOptions: MapOptions = {
    flights: true,
    countries: true
  };

  constructor() {
  }

  selectFlight(flight: Flight) {
    this.flightsService.selectFlight(flight);
  }

  ngOnInit() {


  }
}

class MapOptions {
  flights: boolean = false;
  countries: boolean = false;
}

