import { Location, LocationStrategy, PathLocationStrategy, CommonModule } from '@angular/common';
import { AirportService } from '../services/airport.service';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';

import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FlightStatsComponent } from '../flight-stats/flight-stats.component';
import { RelativeTimePipe } from '../pipes/relativeTimePipe';
import { FlightDistancePipe } from '../pipes/flightDistancePipe';
import { CesiumDirective } from '../cesium.directive';

import { Flight } from '../models/flight';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Airport } from '../models/airport';
import DayJS from 'dayjs';
import DayJSUtc from 'dayjs/plugin/utc';
import DayJSTimezone from 'dayjs/plugin/timezone';

DayJS.extend(DayJSUtc);
DayJS.extend(DayJSTimezone);

import firebase from 'firebase/compat';
import { FlightsService, SaveResultType } from '../services/flights.service';
import User = firebase.User;
import { TRAVEL_CLASSES } from '../seat-info/seat-info.component';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';


@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, FlightStatsComponent, RelativeTimePipe, FlightDistancePipe, CesiumDirective, ExactDurationPipe],
  selector: 'app-flight-edit',
  providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
  templateUrl: './flight-edit.component.html',
  styleUrls: ['./flight-edit.component.css']
})
export class FlightEditComponent implements OnInit, OnDestroy {

  constructor(private route: ActivatedRoute,
              private router: Router, private db: AngularFireDatabase,
              private afAuth: AngularFireAuth,
              private airportService: AirportService,
              private flightsService: FlightsService,
              private location: Location) {
  }



  @Input()
  flightId: String;

  flight: Flight;
  user: User;

  departureTime = '00:00';
  arrivalTime = '00:00';

  TRAVEL_CLASSES_LIST = Array.from(TRAVEL_CLASSES.values());

  objectRef: string;

  fromAirport$: BehaviorSubject<Airport> = new BehaviorSubject(null);
  toAirport$: BehaviorSubject<Airport> = new BehaviorSubject(null);
  private subs = new Subscription();

  flightsForMap() {
    return of([this.flight]);
  }

  ngOnInit() {

    console.log(TRAVEL_CLASSES, this.TRAVEL_CLASSES_LIST);
    this.subs.add(this.afAuth.user.subscribe(user => {
      this.user = user;

      if (this.flightId === 'new') {
        this.objectRef = null;
        this.flight = new Flight();
        this.flight._id = null;
        this.flight.date = DayJS().format('YYYY-MM-DD');
      } else {
        this.loadFlight(this.flightId);
      }
    }));


    this.subs.add(this.fromAirport$.subscribe(fromAirport => {
      if (fromAirport && this.flight && this.flight.departureTime && fromAirport.timezoneId) {
        this.departureTime = DayJS(this.flight.departureTime).tz(fromAirport.timezoneId).format('HH:mm');
      }
    }));

    this.subs.add(this.toAirport$.subscribe(toAirport => {
      if (toAirport && this.flight && this.flight.arrivalTime && toAirport.timezoneId) {
        this.arrivalTime = DayJS(this.flight.arrivalTime).tz(toAirport.timezoneId).format('HH:mm');
      }
    }));
  }

  selectDepartureTime() {

    const time = this.departureTime;

    const dateWithWithTime = DayJS(this.flight.date).format('YYYY-MM-DD') + 'T' + time;
    this.fromAirport$.subscribe(ap => {
      this.flight.departureTime = DayJS.tz(dateWithWithTime, ap.timezoneId).clone().tz('UTC').format(); // '2013-06-01T00:00:00',
    });
  }

  selectArrivalTime() {

    const time = this.arrivalTime;

    const dateWithWithTime = DayJS(this.flight.date).format('YYYY-MM-DD') + 'T' + time;
    this.toAirport$.subscribe(ap => {
      this.flight.arrivalTime = DayJS.tz(dateWithWithTime, ap.timezoneId).tz('UTC').format(); // '2013-06-01T00:00:00',
      if (this.flight.arrivalTime < this.flight.departureTime) { // When the arrival is BEFORE the Departure, then we add a day.
        this.flight.arrivalTime = DayJS(this.flight.arrivalTime).add(1, 'days').clone().tz('UTC').format();
      }
    });

  }

  loadFlight(flightId) {
    this.flightsService.loadFlight(flightId).subscribe(
      (flight) => {
        this.flight = flight;
        this.objectRef = flight._objectReference;
        this.loadFromAirport(this.flight.from);
        this.loadToAirport(this.flight.to);
      }
    );
  }

  selectedDate(momentDate: DayJS.Dayjs) {
    this.flight.date = momentDate.format('YYYY-MM-DD');
  }

  loadAirport(code: String): Observable<Airport> {
    if (code && code.length === 3) {
      return this.airportService.loadAirport(code);
    } else {
      return of(null);
    }
  }

  loadFromAirport(code: String): Observable<Airport> {
    const ap = this.loadAirport(code);
    ap.subscribe((a) => this.fromAirport$.next(a));
    return ap;
  }

  loadToAirport(code: String): Observable<Airport> {
    const ap = this.loadAirport(code);
    ap.subscribe((a) => this.toAirport$.next(a));
    return ap;
  }

  autocomplete(): void {
    this.flight.needsAutocomplete = (!this.flight.needsAutocomplete);
    return this.save();
  }

  save(): void {
    const sub = this.flightsService.saveFlight(this.flight)
      .subscribe(result => {
        if (result.type === SaveResultType.CREATED) {
          const flightId = result.flightId;
          this.loadFlight(flightId);
          this.location.replaceState('flight/' + flightId);
        }
        sub.unsubscribe();
      });
  }

  delete(): void {
    if (this.objectRef) {
      this.flight._deleted = true;

      const sub = this.flightsService.saveFlight(this.flight)
        .subscribe(_ => {
          this.router.navigateByUrl('/flights');
          sub.unsubscribe();
        });
    } else {
      this.router.navigateByUrl('/flights');
    }
  }
  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}

