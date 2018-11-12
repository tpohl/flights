import { Flight } from './../models/flight';
import { Component, OnInit } from '@angular/core';
import { AngularFireDatabase } from 'angularfire2/database';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AngularFireAuth } from 'angularfire2/auth';

@Component({
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.css']
})
export class FlightListComponent implements OnInit {
// https://angularfirebase.com/lessons/infinite-scroll-with-firebase-data-and-angular-animation/
  flights: Observable<Flight[]>;

  constructor(private db: AngularFireDatabase, private afAuth: AngularFireAuth) { }

  ngOnInit() {
    this.afAuth.user.subscribe(user => {
      const flightList = this.db.list<Flight>('users/' + user.uid + '/flights');
      this.flights = flightList.snapshotChanges()
        .pipe(map(snapshots =>
          snapshots.map(c => {
            const f = c.payload.val();
            f._id = c.key;
            return f;
          })))
        .pipe(map(flights => flights.sort((a: Flight, b: Flight) => {
          if ((a.departureTime && !b.departureTime) || a.departureTime < b.departureTime) {
            return 1;
          } else if ((!a.departureTime && b.departureTime) || a.departureTime > b.departureTime) {
            return -1;
          } else {
            return 0;
          }
        })));

    });
  }

}
