import { AirportService } from './../services/airport.service';
import { Observable, of } from 'rxjs';
import { BehaviorSubject } from 'rxjs';

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

import { Flight } from '../models/flight';
import { AngularFireDatabase } from 'angularfire2/database';
import { AngularFireAuth } from 'angularfire2/auth';
import { Airport } from '../models/airport';
import { Moment } from '../../../functions/node_modules/moment';


@Component({
  selector: 'app-flight-edit',
  templateUrl: './flight-edit.component.html',
  styleUrls: ['./flight-edit.component.css']
})
export class FlightEditComponent implements OnInit {
  flight: Flight;
  objectRef: string;

  fromAirport$: BehaviorSubject<Airport> = new BehaviorSubject(null);
  toAirport$: BehaviorSubject<Airport> = new BehaviorSubject(null);

  constructor(private route: ActivatedRoute,
    private router: Router, private db: AngularFireDatabase, private afAuth: AngularFireAuth, private airportService: AirportService) {
  }


  ngOnInit() {
    this.route.params.subscribe(params => {
      this.afAuth.user.subscribe(user => {
        const flightId = params.flightId;
        if (flightId === 'new') {
          this.objectRef = null;
          this.flight = new Flight();
        } else {
          this.objectRef = 'users/' + user.uid + '/flights/' + flightId;
          const flightObject = this.db.object<Flight>(this.objectRef);
          flightObject.valueChanges().subscribe(
            (flight) => {
              this.flight = flight;
              this.loadFromAirport(this.flight.from);
              this.loadToAirport(this.flight.to);
            }
          );
        }
      });
    });
  }

  selectedDate(momentDate: Moment) {
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
    this.save;
  }

  save(): void {
    console.log('Saving Flight', this.flight);
    this.afAuth.user.subscribe(user => {
      if (this.objectRef) {
        const flightObject = this.db.object<Flight>(this.objectRef);
        flightObject.update(this.flight);
      } else {
        const flightList = this.db.list<Flight>('users/' + user.uid + '/flights');
        flightList.push(this.flight);

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
