import { Flight } from './../models/flight';
import { Component, OnInit } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/database';
import { Observable, from } from 'rxjs';
import { map, reduce, flatMap, take, shareReplay } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/auth';

@Component({
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.css']
})
export class FlightListComponent implements OnInit {
  // https://angularfirebase.com/lessons/infinite-scroll-with-firebase-data-and-angular-animation/
  flights: Observable<Flight[]>;

  stats: Observable<Stats>;

  userId: string;

  constructor(private db: AngularFireDatabase, private afAuth: AngularFireAuth) { }

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
            })),
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
      this.stats = flightList.pipe(
        flatMap(flightArray => from(flightArray)
          .pipe(
            reduce<Flight, Stats>(
              (stats, flight) => {

                stats.count += 1;
                stats.distance += flight.distance;
                return stats;
              },
              new Stats()),
            map(stats => {
              stats.distance = Math.round(stats.distance);
              return stats;
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
}
