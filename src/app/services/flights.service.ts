import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { AngularFireDatabase } from '@angular/fire/database';

import { Airport } from '../models/airport';
import { flatMap, map, shareReplay } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/auth';
import { Flight } from '../models/flight';

@Injectable()
export class FlightsService {

  private airports = new Map<String, Observable<Airport>>();


  constructor(private db: AngularFireDatabase, private afAuth: AngularFireAuth) {
  }

  getFlights() {
    return this.afAuth.user
      .pipe(
        map(user => user.uid),
        flatMap(userId => this.db.list<Flight>('users/' + userId + '/flights').snapshotChanges()),
        map(snapshots =>
          snapshots.map(c => {
            const f = c.payload.val();
            f._id = c.key;
            return f;
          })),
        shareReplay(1)
      );
  }

  getFlightsWithSameAircraft(compareFlight: Flight) {
    return this.getFlights().pipe(
      map(flights => flights.filter(
        flight => flight.aircraftRegistration === compareFlight.aircraftRegistration)
      )
    );
  }

  getFlightsWithSameAircraftType(compareFlight: Flight) {
    return this.getFlights().pipe(
      map(flights => flights.filter(
        flight => flight.aircraftType === compareFlight.aircraftType)
      )
    );
  }

  getFlightsWithSameAirline(compareFlight: Flight) {
    return this.getFlights().pipe(
      map(flights => flights.filter(
        flight => flight.carrier === compareFlight.carrier)
      )
    );
  }

  getFlightsOnSameSeat(compareFlight: Flight) {
    return this.getFlights().pipe(
      map(flights => flights.filter(
        flight => flight.seat === compareFlight.seat)
      )
    );
  }
}
