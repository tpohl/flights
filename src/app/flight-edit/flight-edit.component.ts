import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { AirportService } from './../services/airport.service';
import { Observable, of } from 'rxjs';
import { BehaviorSubject } from 'rxjs';

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

import { Flight } from '../models/flight';
import { AngularFireDatabase } from 'angularfire2/database';
import { AngularFireAuth } from 'angularfire2/auth';
import { User } from 'firebase/app';
import { Airport } from '../models/airport';
import * as moment from 'moment-timezone';

import { AmazingTimePickerService } from 'amazing-time-picker';
import { tap } from 'rxjs/operators';


@Component({
  selector: 'app-flight-edit',
  providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
  templateUrl: './flight-edit.component.html',
  styleUrls: ['./flight-edit.component.css']
})
export class FlightEditComponent implements OnInit {
  flight: Flight;
  user: User;
  //departureLocalTime: Moment;

  departureTime = '00:00';

  objectRef: string;

  fromAirport$: BehaviorSubject<Airport> = new BehaviorSubject(null);
  toAirport$: BehaviorSubject<Airport> = new BehaviorSubject(null);

  constructor(private route: ActivatedRoute, private atp: AmazingTimePickerService,
    private router: Router, private db: AngularFireDatabase,
    private afAuth: AngularFireAuth,
    private airportService: AirportService, private location: Location) {
  }


  ngOnInit() {
    this.route.params.subscribe(params => {
      this.afAuth.user.subscribe(user => {
        this.user = user;
        const flightId = params.flightId;
        if (flightId === 'new') {
          this.objectRef = null;
          this.flight = new Flight();
          this.flight.date = moment().format('YYYY-MM-DD');
        } else {
          this.loadFlight(flightId);
        }
      });
    });

    this.fromAirport$.subscribe(fromAirport => {
      if (fromAirport && this.flight) {
        this.departureTime = moment(this.flight.departureTime).tz(fromAirport.timezoneId).format('HH:mm');
        console.log('AAAA', this.departureTime, fromAirport.timezoneId);
      }
    });
  }

  selectDepartureTime() {
    const amazingTimePicker = this.atp.open({
      time: this.departureTime,
      changeToMinutes: true
    });
    amazingTimePicker.afterClose().subscribe(time => {
      this.departureTime = time;
      console.log('TIME', time);

      const dateWithWithTime = moment(this.flight.date).format('YYYY-MM-DD') + 'T' + time;
      this.fromAirport$.subscribe(fromAirport => {
        this.flight.departureTime = moment.tz(dateWithWithTime, fromAirport.timezoneId); // '2013-06-01T00:00:00',
      });
    });
  }

  loadFlight(flightId) {
    this.objectRef = 'users/' + this.user.uid + '/flights/' + flightId;
    const flightObject = this.db.object<Flight>(this.objectRef);
    flightObject.valueChanges().subscribe(
      (flight) => {
        console.log('Loaded Flight');
        this.flight = flight;
        this.loadFromAirport(this.flight.from)
        /*
        .pipe(tap(fromAirport=> {
        });
        */
        this.loadToAirport(this.flight.to);
      }
    );
  }

  selectedDate(momentDate: moment.Moment) {
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
    console.log('Saving Flight', this.flight);
    this.afAuth.user.subscribe(user => {
      if (this.objectRef) {
        const flightObject = this.db.object<Flight>(this.objectRef);
        flightObject.update(this.flight);
      } else {
        const flightList = this.db.list<Flight>('users/' + user.uid + '/flights');
        flightList.push(this.flight).then(reference => {
          const flightId = reference.getKey();
          this.loadFlight(flightId);
          this.location.replaceState('flight/' + flightId);
        }, error => {
          console.log(error);
        }
        );
      }

    });
  }

  delete(): void {
    console.log('Deleting Flight', this.flight);
    if (this.objectRef) {
      const flightObject = this.db.object<Flight>(this.objectRef);
      flightObject.remove().then(value => {
        this.router.navigateByUrl('/flights');
      });
    } else {
      this.router.navigateByUrl('/flights');
    }
  }
}
