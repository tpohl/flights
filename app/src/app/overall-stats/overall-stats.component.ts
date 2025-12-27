import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { Flight } from '../models/flight';
import { OverallStats } from '../models/stats';
import { FlightsService } from '../services/flights.service';
import { CommonModule } from '@angular/common';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';

@Component({
  selector: 'app-overall-stats',
  imports: [CommonModule, ExactDurationPipe],
  templateUrl: './overall-stats.component.html',
  styleUrl: './overall-stats.component.css'
})
export class OverallStatsComponent implements OnInit {


  flights: Observable<Flight[]> = new Observable<Flight[]>();

  stats$: Observable<OverallStats> = new Observable<OverallStats>();

  constructor(private flightsService: FlightsService) {
  }

  ngOnInit() {
    this.flights = this.flightsService.flights$;
    this.stats$ = this.flightsService.stats$;
  }
}
