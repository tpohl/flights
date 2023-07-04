import { Flight } from './../models/flight';
import { Component, OnInit } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Observable, from, combineLatest, BehaviorSubject } from 'rxjs';
import { map, reduce, mergeMap, tap } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { FlightsService } from '../services/flights.service';
import { OverallStats } from '../models/stats';

@Component({
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.css']
})
export class FlightListComponent implements OnInit {
  // https://angularfirebase.com/lessons/infinite-scroll-with-firebase-data-and-angular-animation/
  flights: Observable<Flight[]>;

  stats$: Observable<OverallStats>;

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


