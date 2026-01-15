import { Injectable, inject, Injector, runInInjectionContext, Signal, signal } from '@angular/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { BehaviorSubject, from, Observable, of, combineLatest, forkJoin } from 'rxjs';

import { filter, map, reduce, switchMap, take, tap } from 'rxjs/operators';
import dayjs from 'dayjs';
import { Flight } from '../models/flight';
import { Airport } from '../models/airport';
import { FlightStats, OverallStats, CountMap } from '../models/stats';
import { AirportService } from './airport.service';
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

@Injectable({
  providedIn: 'root'
})
export class FlightsService {
  private flightSubject = new BehaviorSubject<Flight[]>([]);
  flights: Signal<Flight[]> = toSignal(this.flightSubject, { initialValue: [] });
  activeFlight = signal<Flight | null>(null);

  statsSubject = new BehaviorSubject<OverallStats>(new OverallStats());
  stats: Signal<OverallStats> = toSignal(this.statsSubject, { initialValue: new OverallStats() });

  selectedYear = signal<number | null>(null);

  availableYears: Signal<number[]> = toSignal(
    this.flightSubject.pipe(
      map(flights => {
        const years = flights
          .map(f => f.departureTime ? dayjs(f.departureTime).year() : null)
          .filter((y): y is number => y !== null);
        return Array.from(new Set(years)).sort((a, b) => b - a);
      })
    ),
    { initialValue: [] }
  );

  tooSlowFlights: Signal<Flight[]> = toSignal(
    this.flightSubject.pipe(
      map(flights => this.filterSlowFlights(flights))
    ),
    { initialValue: [] }
  );

  tooFastFlights: Signal<Flight[]> = toSignal(
    this.flightSubject.pipe(
      map(flights => this.filterFastFlights(flights))
    ),
    { initialValue: [] }
  );

  validatedAnomalies: Signal<Flight[]> = toSignal(
    this.flightSubject.pipe(
      map(flights => this.filterValidatedAnomalies(flights))
    ),
    { initialValue: [] }
  );

  invalidFlights: Signal<Flight[]> = toSignal(
    this.flightSubject.pipe(
      map(flights => this.filterInvalidFlights(flights))
    ),
    { initialValue: [] }
  );

  private airportService = inject(AirportService);

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
    combineLatest([
      this.flightSubject,
      toObservable(this.selectedYear, { injector: this.injector })
    ]).pipe(
      switchMap(([flightsArray, year]) => {
        const filteredFlights = year
          ? flightsArray.filter(f => f.departureTime && dayjs(f.departureTime).year() === year)
          : flightsArray;

        if (filteredFlights.length === 0) {
          return of(new OverallStats());
        }

        const airlines = new CountMap();
        const aircraftTypes = new CountMap();
        const aircraftRegistrations = new CountMap();
        const routes = new CountMap();
        const airports = new Set<string>();

        const getSpeed = (f: Flight) => {
          if (!f || !f.durationMilliseconds || f.durationMilliseconds === 0) return 0;
          return flightDistance(f) / (f.durationMilliseconds / 3600000);
        };

        const stats = filteredFlights.reduce((acc, flight) => {
          acc.count += 1;
          const dist = flightDistance(flight);
          const seatClass = flight.class || 'Other';
          if (!!dist && !isNaN(dist)) {
            acc.distance += dist;
          }

          // Calculate effective duration for this flight
          let duration = flight.durationMilliseconds;
          if ((!duration || isNaN(duration) || duration <= 0) && flight.departureTime && flight.arrivalTime) {
            const dep = dayjs(flight.departureTime);
            const arr = dayjs(flight.arrivalTime);
            if (dep.isValid() && arr.isValid()) {
              duration = arr.diff(dep);
              // Store it back on the flight object so components can use it
              flight.durationMilliseconds = duration;
            }
          }

          if (duration && !isNaN(duration) && duration > 0) {
            acc.totalTimeMilliseconds += duration;

            // Speed Records
            const speed = dist / (duration / 3600000);
            const currentFastestSpeed = acc.fastestFlight ? getSpeed(acc.fastestFlight) : 0;
            const currentSlowestSpeed = acc.slowestFlight ? getSpeed(acc.slowestFlight) : Infinity;

            if (!acc.fastestFlight || speed > currentFastestSpeed) {
              acc.fastestFlight = flight;
            }
            if (!acc.slowestFlight || speed < currentSlowestSpeed) {
              acc.slowestFlight = flight;
            }

            acc.timeByClass[seatClass] = (acc.timeByClass[seatClass] || 0) + duration;
          }

          // Distance Records
          if (!acc.longestFlight || dist > flightDistance(acc.longestFlight)) {
            acc.longestFlight = flight;
          }
          if (!acc.shortestFlight || dist < flightDistance(acc.shortestFlight)) {
            acc.shortestFlight = flight;
          }

          // Top Lists
          if (flight.carrier) airlines.add(flight.carrier);
          if (flight.aircraftType) aircraftTypes.add(flight.aircraftType);
          if (flight.aircraftRegistration) aircraftRegistrations.add(flight.aircraftRegistration);
          if (flight.from && flight.to) {
            const route = [flight.from, flight.to].sort().join('-');
            routes.add(route);
          }

          // Class Stats Distance
          acc.distanceByClass[seatClass] = (acc.distanceByClass[seatClass] || 0) + dist;

          acc.airportsVisited.add(flight.from);
          acc.airportsVisited.add(flight.to);
          airports.add(flight.from);
          airports.add(flight.to);

          return acc;
        }, new OverallStats());

        stats.distance = Math.round(stats.distance);
        stats.topAirlines = airlines.getTop(5);
        stats.topAircraftTypes = aircraftTypes.getTop(5);
        stats.topRegistrations = aircraftRegistrations.getTop(5);
        stats.topRoutes = routes.getTop(5);

        // Fetch Airport details for extreme locations
        if (airports.size === 0) {
          return of(stats);
        }

        const airportService = this.injector.get(AirportService);
        const airportRequests = Array.from(airports).map(code => airportService.loadAirport(code).pipe(take(1)));

        return forkJoin(airportRequests).pipe(
          map(airportDetails => {
            const airportMap = new Map<string, Airport>();
            const countries = new CountMap();

            airportDetails.filter((a): a is Airport => !!a).forEach(airport => {
              airportMap.set(airport.code, airport);

              // Handle Extremes
              if (!stats.extremeAirports.north || airport.latitude > stats.extremeAirports.north.latitude) {
                stats.extremeAirports.north = airport;
              }
              if (!stats.extremeAirports.south || airport.latitude < stats.extremeAirports.south.latitude) {
                stats.extremeAirports.south = airport;
              }
              if (!stats.extremeAirports.east || airport.longitude > stats.extremeAirports.east.longitude) {
                stats.extremeAirports.east = airport;
              }
              if (!stats.extremeAirports.west || airport.longitude < stats.extremeAirports.west.longitude) {
                stats.extremeAirports.west = airport;
              }
            });

            // Calculate Top Airports (with names)
            stats.topAirports = stats.airportsVisited.getTop(5).map(item => {
              const ap = airportMap.get(item.name);
              return {
                name: ap ? `${ap.name} (${ap.code})` : item.name,
                count: item.count
              };
            });

            // Calculate Top Countries
            const countryCounts = new Map<string, number>();
            stats.airportsVisited.getItems().forEach(item => {
              const ap = airportMap.get(item.name);
              if (ap?.country?.country) {
                const current = countryCounts.get(ap.country.country) || 0;
                countryCounts.set(ap.country.country, current + item.count);
              }
            });

            stats.topCountries = Array.from(countryCounts.entries())
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5);

            return stats;
          })
        );
      })
    ).subscribe(stats => this.statsSubject.next(stats));
  }

  loadFlight(flightId: string): Observable<Flight | null> {
    // Wait for user to be available, then load the flight
    return authState(this.auth).pipe(
      filter((user): user is User => user !== null),
      take(1),
      switchMap(user => {
        const objectRef = `users/${user.uid}/flights/${flightId}`;
        const flightRef = ref(this.db, objectRef);
        return objectVal<Flight>(flightRef).pipe(
          map(flight => {
            const f = flight ? ({ ...flight, _id: flightId, _objectReference: objectRef }) : null;
            this.activeFlight.set(f);
            return f;
          })
        );
      })
    );
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

  /**
   * Recalculates duration and distance for a flight.
   * This is useful when backend calculations have failed.
   */
  recalculateFlightData(flight: Flight): Observable<boolean> {
    console.log('Recalculating flight data for', flight._id);

    // 1. Recalculate Duration
    if (flight.departureTime && flight.arrivalTime) {
      const dep = dayjs(flight.departureTime);
      const arr = dayjs(flight.arrivalTime);
      if (dep.isValid() && arr.isValid()) {
        const duration = arr.diff(dep);
        if (duration > 0) {
          flight.durationMilliseconds = duration;
        }
      }
    }

    // 2. Recalculate Distance (requires loading airports)
    if (flight.from && flight.to) {
      return forkJoin([
        this.airportService.loadAirport(flight.from).pipe(take(1)),
        this.airportService.loadAirport(flight.to).pipe(take(1))
      ]).pipe(
        switchMap(([fromAp, toAp]) => {
          if (fromAp && toAp) {
            const dist = this.calculateHaversineDistance(
              fromAp.latitude, fromAp.longitude,
              toAp.latitude, toAp.longitude
            );
            if (dist > 0) {
              flight.distance = dist;
            }
          }
          // Save the updated flight
          return this.saveFlight(flight).pipe(map(result => !!result));
        })
      );
    } else {
      // Just save if airports are missing (though distance won't be calculated)
      return this.saveFlight(flight).pipe(map(result => !!result));
    }
  }

  private calculateHaversineDistance(lat1: number, long1: number, lat2: number, long2: number): number {
    const p = 0.017453292519943295;    // Math.PI / 180
    const c = Math.cos;
    const a = 0.5 - c((lat1 - lat2) * p) / 2 + c(lat2 * p) * c((lat1) * p) * (1 - c(((long1 - long2) * p))) / 2;
    return Math.round((12742 * Math.asin(Math.sqrt(a)))); // 2 * R; R = 6371 km
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

  /**
   * Calculates the average speed of a flight in km/h
   */
  getAverageSpeed(flight: Flight): number {
    if (!flight.distance || !flight.durationMilliseconds || flight.durationMilliseconds === 0) {
      return 0;
    }
    return flight.distance / (flight.durationMilliseconds / 3600000);
  }

  /**
   * Filters flights that are anomalously slow (< 300 km/h average speed)
   * This likely indicates data entry errors like wrong arrival time
   * Excludes flights that have been validated by the user
   */
  private filterSlowFlights(flights: Flight[]): Flight[] {
    const MIN_REASONABLE_SPEED = 300; // km/h
    return flights
      .filter(f => f.distance && f.durationMilliseconds && f.durationMilliseconds > 0)
      .filter(f => this.getAverageSpeed(f) < MIN_REASONABLE_SPEED)
      .filter(f => !f.validatedAnomaly)
      .sort((a, b) => this.getAverageSpeed(a) - this.getAverageSpeed(b));
  }

  /**
   * Filters flights that are anomalously fast (> 950 km/h average speed)
   * This likely indicates data entry errors or wrong calculation
   * Excludes flights that have been validated by the user
   */
  private filterFastFlights(flights: Flight[]): Flight[] {
    const MAX_REASONABLE_SPEED = 950; // km/h (faster than commercial aircraft cruise speed)
    return flights
      .filter(f => f.distance && f.durationMilliseconds && f.durationMilliseconds > 0)
      .filter(f => this.getAverageSpeed(f) > MAX_REASONABLE_SPEED)
      .filter(f => !f.validatedAnomaly)
      .sort((a, b) => this.getAverageSpeed(b) - this.getAverageSpeed(a));
  }

  /**
   * Filters flights that are anomalies but have been validated by the user
   */
  private filterValidatedAnomalies(flights: Flight[]): Flight[] {
    const MIN_REASONABLE_SPEED = 300;
    const MAX_REASONABLE_SPEED = 950;
    return flights
      .filter(f => f.validatedAnomaly && f.distance)
      .filter(f => {
        if (f.durationMilliseconds && f.durationMilliseconds < 0) return true;
        if (!f.durationMilliseconds || f.durationMilliseconds <= 0) return true; // Missing or zero duration
        const speed = this.getAverageSpeed(f);
        return speed < MIN_REASONABLE_SPEED || speed > MAX_REASONABLE_SPEED;
      })
      .sort((a, b) => this.getAverageSpeed(b) - this.getAverageSpeed(a));
  }

  /**
   * Filters flights with negative or missing duration, or missing distance (Invalid)
   */
  private filterInvalidFlights(flights: Flight[]): Flight[] {
    return flights
      .filter(f => !f.durationMilliseconds || f.durationMilliseconds <= 0 || !f.distance || f.distance <= 0)
      .filter(f => !f.validatedAnomaly)
      .sort((a, b) => flightsSortFn(a, b));
  }

  /**
   * Check if a flight is an anomaly (slow, fast or invalid)
   */
  isAnomalies(flight: Flight): boolean {
    if (!flight.distance || flight.distance <= 0) {
      return true;
    }
    if (!flight.durationMilliseconds || flight.durationMilliseconds <= 0) {
      return true;
    }

    const speed = this.getAverageSpeed(flight);
    const MIN_REASONABLE_SPEED = 300;
    const MAX_REASONABLE_SPEED = 950;
    return speed < MIN_REASONABLE_SPEED || speed > MAX_REASONABLE_SPEED;
  }

  /**
   * Check if a flight is anomalously slow
   */
  isSlowAnomaly(flight: Flight): boolean {
    if (!flight.distance || !flight.durationMilliseconds || flight.durationMilliseconds === 0) {
      return false;
    }
    return this.getAverageSpeed(flight) < 300;
  }

  /**
   * Check if a flight is anomalously fast
   */
  isFastAnomaly(flight: Flight): boolean {
    if (!flight.distance || !flight.durationMilliseconds || flight.durationMilliseconds <= 0) {
      return false;
    }
    return this.getAverageSpeed(flight) > 950;
  }

  /**
   * Check if a flight is an invalid anomaly (negative or missing duration/distance)
   */
  isInvalidAnomaly(flight: Flight): boolean {
    return !flight.durationMilliseconds || flight.durationMilliseconds <= 0 || !flight.distance || flight.distance <= 0;
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
