import { Flight } from './../models/flight';
import { Component, OnInit } from '@angular/core';
import { AngularFireDatabase } from 'angularfire2/database';
import { Observable } from 'rxjs';
import { AngularFireAuth } from 'angularfire2/auth';

@Component({
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.css']
})
export class FlightListComponent implements OnInit {

  flights: Observable<Flight[]>;

  constructor(private db: AngularFireDatabase, private afAuth: AngularFireAuth) { }

  ngOnInit() {
    this.afAuth.user.subscribe(user => {
      let flightList = this.db.list<Flight>('users/' + user.uid + '/flights');
      this.flights = flightList.valueChanges();
    });

  }

}
