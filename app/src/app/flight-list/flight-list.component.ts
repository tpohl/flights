import { Flight } from './../models/flight';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { FlightsService } from '../services/flights.service';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { OverallStats } from '../models/stats';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ExactDurationPipe, FlightTileComponent],
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.css']
})
export class FlightListComponent implements OnInit {
  // https://angularfirebase.com/lessons/infinite-scroll-with-firebase-data-and-angular-animation/
  flights: Observable<Flight[]>;

  stats$: Observable<OverallStats>;

  mapOptions: MapOptions = {
    flights: true,
    countries: true
  };

  constructor(private flightsService: FlightsService) {
  }

  selectFlight(flight: Flight) {
    this.flightsService.selectFlight(flight);
  }

  ngOnInit() {
    this.flights = this.flightsService.flights$;
    this.stats$ = this.flightsService.stats$;
  }
}

class MapOptions {
  flights: boolean;
  countries: boolean;
}

