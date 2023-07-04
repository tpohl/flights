import { Flight } from './../models/flight';
import { Component, Input, OnInit } from '@angular/core';
import { FlightsService } from '../services/flights.service';
import { Observable } from 'rxjs';
import { FlightStats } from '../models/stats';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-flight-stats',
  templateUrl: './flight-stats.component.html',
  styleUrls: ['./flight-stats.component.css']
})
export class FlightStatsComponent implements OnInit {
  private _flight: Flight;

  stats$: Observable<FlightStats>;

  flightsHidden = true;

  constructor(private flightsService: FlightsService) {
  }

  @Input()
  set flight(newFlight: Flight) {
    this._flight = newFlight;
    this.stats$ = this.flightsService.computeStats(this._flight);
  }

  public get flight() {
    return this._flight;
  }

  ngOnInit() {
  }
}


