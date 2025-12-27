import { Component, OnInit, Signal, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Flight } from '../models/flight';
import { OverallStats } from '../models/stats';
import { FlightsService } from '../services/flights.service';
import { CommonModule } from '@angular/common';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';

@Component({
  standalone: true,
  selector: 'app-overall-stats',
  imports: [CommonModule, ExactDurationPipe, MatCardModule, MatIconModule, MatListModule],
  templateUrl: './overall-stats.component.html',
  styleUrl: './overall-stats.component.css'
})
export class OverallStatsComponent implements OnInit {

  private flightsService = inject(FlightsService);

  flights: Signal<Flight[]> = this.flightsService.flights;

  stats: Signal<OverallStats> = this.flightsService.stats;

  constructor() {
  }

  ngOnInit() {
  }
}
