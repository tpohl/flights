import { Injectable, inject, Injector, runInInjectionContext, Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, from, Observable, of } from 'rxjs';

import { filter, map, reduce, switchMap, take, tap } from 'rxjs/operators';
import { Flight } from '../models/flight';
import { FlightStats, OverallStats } from '../models/stats';
import { flightDistance } from '../pipes/flightDistancePipe';
import { AeroAPITrackResponse, UpdateType } from '../models/aeroapi';

import { Database, ref, set, push } from '@angular/fire/database';
import { Auth, authState, User } from '@angular/fire/auth';
import { listVal, objectVal } from 'rxfire/database';

export const enum SaveResultType { CREATED, UPDATED }

export class SaveResult {
  flightId!: string;
  type!: SaveResultType;
}

@Injectable()
export class FlightsService {
  private flightSubject = new BehaviorSubject<Flight[]>([]);
  flights: Signal<Flight[]> = toSignal(this.flightSubject, { initialValue: [] });
  activeFlight = signal<Flight | null>(null);

  statsSubject = new BehaviorSubject<OverallStats>(new OverallStats());
  stats: Signal<OverallStats> = toSignal(this.statsSubject, { initialValue: new OverallStats() });

  private selectedFlight$ = new BehaviorSubject<Flight | null>(null);

  private auth = inject(Auth);
  private user = null as User | null;
  private db = inject(Database);
  private injector = inject(Injector);

  constructor() {
    authState(this.auth).pipe(filter((user): user is User => user !== null), take(1)).subscribe(user => {
      this.user = user;
      this.init();
    });
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
      return this.flightSubject.pipe(
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


    runInInjectionContext(this.injector, () => of(this.user).pipe(
      filter(user => !!user),
      switchMap(user => {
        const flightsRef = ref(this.db, `users/${user.uid}/flights`);
        return listVal<Flight>(flightsRef, { keyField: '_id' });
      }),
      map(flights => flights.filter(flight => !flight._deleted && !!flight.departureTime)),
      map(flights => flights.sort(flightsSortFn))
    ).subscribe(flights => this.flightSubject.next(flights))
    );

    this.initStats();
  }

  private initStats() {

    this.flightSubject.pipe(
      switchMap(flightsArray => from(flightsArray)
        .pipe(
          reduce<Flight, OverallStats>(
            (stats, flight) => {
              stats.count += 1;
              if (!!flight.distance && !isNaN(+flight.distance)) {
                stats.distance = stats.distance + flightDistance(flight);
              }
              if (!!flight.durationMilliseconds && !isNaN(+flight.durationMilliseconds)) {
                stats.totalTimeMilliseconds = stats.totalTimeMilliseconds + flight.durationMilliseconds;
              }
              stats.airportsVisited.add(flight.from);
              stats.airportsVisited.add(flight.to);
              return stats;
            },
            new OverallStats()),
          map(stats => {
            stats.distance = Math.round(stats.distance);
            return stats;
          })

        )
      )
    ).subscribe(stats => this.statsSubject.next(stats));
  }

  loadFlight(flightId: string): Observable<Flight | null> {
    var flight$: Observable<Flight | null> = of(null);
    const user = this.user;
    if (!user) {
      return of(null);
    } else {
      runInInjectionContext(this.injector, () => {
        const objectRef = `users/${user.uid}/flights/${flightId}`;
        const flightRef = ref(this.db, objectRef);
        flight$ = objectVal<Flight>(flightRef).pipe(
          map(flight => {
            const f = flight ? ({ ...flight, _objectReference: objectRef }) : null;
            this.activeFlight.set(f);
            return f;
          })
        );
      });
      return flight$;
    }
  }

  loadFlightTrack(flight: Flight, removeProjectedIfActualsAreAvailable = true): Observable<AeroAPITrackResponse | null> {
    const user = this.user;
    if (!user || !flight.flightAwareFlightId) {
      return of(null);
    }
    return runInInjectionContext(this.injector, () => {
      const objectRef = `users/${user.uid}/aeroApiTracks/${flight.flightAwareFlightId}`;
      const trackRef = ref(this.db, objectRef);
      return objectVal<AeroAPITrackResponse>(trackRef)
        .pipe(
          map(track => {
            if (removeProjectedIfActualsAreAvailable
              && !!track
              && !!track.actual_distance
              && track.actual_distance > 0
              && track.positions.some(p => p.update_type !== UpdateType.P)) {
              track.positions = track.positions.filter(p => p.update_type !== UpdateType.P);
            }
            return track;
          })
        );
    });

  }

  saveFlight(_flight: Flight): Observable<SaveResult | null> {
    // console.log('Saving Flight', _flight);
    const user = this.user;
    if (!user) {
      return of(null);
    }
    const flight = clearFlight(_flight);
    return runInInjectionContext(this.injector, () => {
      if (!!flight._objectReference) {
        const flightRef = ref(this.db, flight._objectReference);
        return from(set(flightRef, flight)).pipe(
          map(() => ({ flightId: flight._id, type: SaveResultType.UPDATED } as SaveResult))
        );
      } else {
        const newFlightRef = push(ref(this.db, `users/${user.uid}/flights`));
        flight._id = newFlightRef.key;
        return from(set(newFlightRef, flight)).pipe(
          map(() => ({ flightId: flight._id, type: SaveResultType.CREATED } as SaveResult))
        );
      }
    })
      ;
  }

}

const clearFlight = (flight: Flight) => {   // Clear any undefined values
  (Object.keys(flight) as (keyof Flight)[]).forEach(
    key => {
      if (!flight[key]) {
        (flight as any)[key] = null;
      }
    }
  );
  return flight;
};

const flightsSortFn = (a: Flight, b: Flight) => {
  if ((a.departureTime && !b.departureTime) || a.departureTime < b.departureTime) {
    return 1;
  } else if ((!a.departureTime && b.departureTime) || a.departureTime > b.departureTime) {
    return -1;
  } else {
    return 0;
  }
};
