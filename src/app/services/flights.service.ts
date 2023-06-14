import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, combineLatest, from, Observable, of, Subject } from 'rxjs';

import { AngularFireDatabase } from '@angular/fire/compat/database';

import { Airport } from '../models/airport';
import { distinctUntilChanged, filter, map, mergeMap, reduce, shareReplay, switchMap, take, tap } from 'rxjs/operators';
import { Flight } from '../models/flight';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { FlightStats, OverallStats } from '../models/stats';

@Injectable()
export class FlightsService {
  private flightSubject = new BehaviorSubject<Flight[]>([]);
  flights$ = this.flightSubject.asObservable();

  stats$: Observable<OverallStats>;

  private selectedFlight$ = new BehaviorSubject<Flight>(null);

  constructor(private db: AngularFireDatabase, private afAuth: AngularFireAuth) {
    this.init();
  }

  selectFlight(flight: Flight) {
    this.selectedFlight$.next(flight);
  }

  computeStats(selectedFlight: Flight): Observable<FlightStats> {
    if (!!!selectedFlight) {
      return of(new FlightStats());
    } else {
      const seedFn = () => {
        const statistics = new FlightStats();
        statistics.hasAircraft = true;
        statistics.aircraft = selectedFlight.aircraftRegistration;
        statistics.flight = selectedFlight;
        return statistics
      }
      return this.flights$.pipe(
       // take(1),
        switchMap((flightArray) => from(flightArray)
          .pipe(
            reduce<Flight, FlightStats>(
              (stats, flight) => {


                if (!!selectedFlight.aircraftRegistration && (selectedFlight.aircraftRegistration == flight.aircraftRegistration)) {
                  stats.flightsWithAircraft.push(flight);
                }
                if (!!selectedFlight.aircraftType && (selectedFlight.aircraftType == flight.aircraftType)) {
                  stats.flightsWithType += 1;
                }
                if (!!selectedFlight.from && !!selectedFlight.to) {
                  if (selectedFlight.from === flight.from && selectedFlight.to === flight.to) {
                    stats.flightsOnRoute += 1;
                  } else if (selectedFlight.to === flight.from && selectedFlight.from === flight.to) {
                    stats.flightsOnRoute += 1;
                  }
                }
                return stats;
              },
              seedFn())
          )
        ),
        tap(console.log)
      );
    }
  }

  private init() {

    this.afAuth.user
      .pipe(
        switchMap(user => this.db.list<Flight>('users/' + user.uid + '/flights').snapshotChanges()),
        map(snapshots =>
          snapshots.map(c => {
            const f = c.payload.val();
            f._id = c.key;
            return f;
          }).filter(flight => !!flight.departureTime))
      ).subscribe(flights => this.flightSubject.next(flights));

    this.initStats();
  }

  private initStats() {
    this.stats$ = this.flights$.pipe(
      switchMap(flightsArray => from(flightsArray)
        .pipe(
          reduce<Flight, OverallStats>(
            (stats, flight) => {
              stats.count += 1;
              stats.distance += flight.distance;
              return stats;
            },
            new OverallStats()),
          map(stats => {
            stats.distance = Math.round(stats.distance);
            console.log("Stats", stats)
            return stats;
          })
        )
      )
    );
  }

}
