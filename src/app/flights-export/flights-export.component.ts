import { Flight } from './../models/flight';
import { Component, OnInit } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/compat/auth';

@Component({
  selector: 'app-flights-export',
  templateUrl: './flights-export.component.html',
  styleUrls: ['./flights-export.component.css']
})
export class FlightsExportComponent implements OnInit {

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
        ;

    });
  }

  flightsToClipbord() {
    this.flights.pipe(map(flightsArray => JSON.stringify(flightsArray))).subscribe(val => {
      const selBox = document.createElement('textarea');
      selBox.style.position = 'fixed';
      selBox.style.left = '0';
      selBox.style.top = '0';
      selBox.style.opacity = '0';
      selBox.value = val;
      document.body.appendChild(selBox);
      selBox.focus();
      selBox.select();
      document.execCommand('copy');
      document.body.removeChild(selBox);
    });
  }

}
