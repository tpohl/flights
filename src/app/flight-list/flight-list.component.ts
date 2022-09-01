import { Flight } from './../models/flight';
import { Component, OnInit } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Observable, from, Subject, combineLatest, BehaviorSubject } from 'rxjs';
import { map, reduce, flatMap, take, shareReplay, filter, mergeMap, tap } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/compat/auth';

@Component({
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.css']
})
export class FlightListComponent implements OnInit {
  // https://angularfirebase.com/lessons/infinite-scroll-with-firebase-data-and-angular-animation/
  flights: Observable<Flight[]>;

  stats: Observable<Stats>;

  selectedFlight$ = new BehaviorSubject<Flight>(null);

  userId: string;

  constructor(private db: AngularFireDatabase, private afAuth: AngularFireAuth) {
  }

  selectFlight(flight: Flight) {
    this.selectedFlight$.next(flight);
  }

  ngOnInit() {
    this.afAuth.user.subscribe(user => {
      this.userId = user.uid;
      const flightList = this.db.list<Flight>('users/' + user.uid + '/flights').snapshotChanges()
        .pipe(
          map(snapshots =>
            snapshots.map(c => {
              const f = c.payload.val();
              f._id = c.key;
              return f;
            }).filter(flight => !!flight.departureTime)),
          shareReplay(1)
        );
      this.flights = flightList
        .pipe(
          map(flights => flights.sort((a: Flight, b: Flight) => {
            if ((a.departureTime && !b.departureTime) || a.departureTime < b.departureTime) {
              return 1;
            } else if ((!a.departureTime && b.departureTime) || a.departureTime > b.departureTime) {
              return -1;
            } else {
              return 0;
            }
          }))
        );
      this.stats = combineLatest([flightList, this.selectedFlight$]).pipe(
        mergeMap(([flightArray, selectedFlight]) => from(flightArray)
          .pipe(
            reduce<Flight, Stats>(
              (stats, flight) => {

                stats.count += 1;
                stats.distance += flight.distance;
                if (!!selectedFlight) {
                  if (!!selectedFlight.aircraftRegistration && (selectedFlight.aircraftRegistration == flight.aircraftRegistration)) {
                    stats.flightsWithAircraft += 1;
                  }
                  if (!!selectedFlight.aircraftType && (selectedFlight.aircraftType == flight.aircraftType)) {
                    stats.flightsWithType += 1;
                  }
                }
                return stats;
              },
              new Stats()),
            map(stats => {
              stats.distance = Math.round(stats.distance);
              return stats;
            }, new Stats()),
            tap((stats) => {
              stats.hasAircraft = !!selectedFlight;
              if (stats.hasAircraft) {
                stats.aircraft = selectedFlight.aircraftRegistration;
              }
            })
          )
        )
      );
    });
  }
}

class Stats {
  count = 0;
  distance = 0;
  hasAircraft = false;
  aircraft = 'select';
  flightsWithAircraft = 0;
  flightsWithType = 0;
}
