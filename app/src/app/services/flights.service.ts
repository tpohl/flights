import { Injectable } from '@angular/core';
import { BehaviorSubject, from, Observable, of } from 'rxjs';

import { AngularFireDatabase } from '@angular/fire/compat/database';

import { filter, map, reduce, switchMap, take, tap } from 'rxjs/operators';
import { Flight } from '../models/flight';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { FlightStats, OverallStats } from '../models/stats';

export const enum SaveResultType {CREATED, UPDATED}

export class SaveResult {
  flightId: string;
  type: SaveResultType;
}

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
        return statistics;
      };
      return this.flights$.pipe(
        filter(flightArray => !!flightArray && flightArray.length > 1),
        take(1),
        switchMap((flightArray) => from(flightArray)
          .pipe(
            reduce<Flight, FlightStats>(
              (stats, flight) => {


                if (!!selectedFlight.aircraftRegistration && (selectedFlight.aircraftRegistration === flight.aircraftRegistration)) {
                  stats.flightsWithAircraft.push(flight);
                }
                if (!!selectedFlight.aircraftType && (selectedFlight.aircraftType === flight.aircraftType)) {
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
              seedFn()),
            tap(_stats => _stats.flightsWithAircraft = _stats.flightsWithAircraft.sort(flightsSortFn))
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
          })
            .filter(flight => !flight._deleted)
            .filter(flight => !!flight.departureTime))
        , map(_flights => _flights.sort(flightsSortFn))
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
              if (!!flight.distance && !isNaN(+flight.distance)) {
                stats.distance = 0 + stats.distance + parseFloat('' + flight.distance);
              }
              if (!!flight.durationMilliseconds && !isNaN(+flight.durationMilliseconds)) {
                stats.totalTimeMilliseconds = stats.totalTimeMilliseconds + flight.durationMilliseconds;
              }
              return stats;
            },
            new OverallStats()),
          map(stats => {
            stats.distance = Math.round(stats.distance);
            return stats;
          })
        )
      )
    );
  }

  loadFlight(flightId: string): Observable<Flight> {
    return this.afAuth.user
      .pipe(
        switchMap(user => {
          const objectRef = 'users/' + user.uid + '/flights/' + flightId;
          const flightObject = this.db.object<Flight>(objectRef);
          return flightObject.valueChanges()
            .pipe(
              tap(flight => flight._objectReference = objectRef)
            );
        }));
  }

  saveFlight(_flight: Flight): Observable<SaveResult> {
    console.log('Saving Flight', _flight);
    const flight = clearFlight(_flight);
    return this.afAuth.user.pipe(
      switchMap(user => {
          if (!!flight._objectReference) {
            console.log('Saving');
            const flightObject = this.db.object<Flight>(flight._objectReference);
            return from(flightObject.update(flight)).pipe(
              map(_ => ({
                  flightId: flight._id,
                  type: SaveResultType.UPDATED
                })
              )
            );

          } else {


            console.log('Creating new', flight);
            const flightList = this.db.list<Flight>('users/' + user.uid + '/flights');

            return from(flightList.push(flight))
              .pipe(
                map(reference => ({
                    flightId: reference.key,
                    type: SaveResultType.CREATED
                  })
                )
              );
          }
        }
      )
    );
  }

}

const clearFlight =  (flight: Flight) => {   // Clear any undefined values
  Object.keys(flight).forEach(
    key => {
      if (!!!flight[key]) {
        flight[key] = null;
      }
    }
  );
  return flight;
}

const flightsSortFn = (a: Flight, b: Flight) => {
  if ((a.departureTime && !b.departureTime) || a.departureTime < b.departureTime) {
    return 1;
  } else if ((!a.departureTime && b.departureTime) || a.departureTime > b.departureTime) {
    return -1;
  } else {
    return 0;
  }
};
