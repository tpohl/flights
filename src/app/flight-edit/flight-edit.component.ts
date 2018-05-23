import { Observable } from 'rxjs';
import { BehaviorSubject } from 'rxjs';

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';

import { Flight } from '../models/flight';
import { AngularFireDatabase } from 'angularfire2/database';
import { AngularFireAuth } from 'angularfire2/auth';


@Component({
  selector: 'app-flight-edit',
  templateUrl: './flight-edit.component.html',
  styleUrls: ['./flight-edit.component.css']
})
export class FlightEditComponent implements OnInit {
  flight: Flight;


  constructor(private route: ActivatedRoute,
    private db: AngularFireDatabase, private afAuth: AngularFireAuth) {
  }


  ngOnInit() {
    this.route.params.subscribe(params => {
      this.afAuth.user.subscribe(user => {
        const flightId = params.flightId;
        if (flightId === 'new') {
          this.flight = new Flight();
        } else {
          const flightObject = this.db.object<Flight>('users/' + user.uid + '/flights/' + flightId);
          flightObject.valueChanges().subscribe(
            (flight) => { this.flight = flight; }
          );
        }
      });
    });
  }

  save(): void {
    console.log('Saving Flight', this.flight);
    this.afAuth.user.subscribe(user => {
      let flightList = this.db.list<Flight>('users/' + user.uid + '/flights');
      flightList.push(this.flight);
    });
  }

  delete(): void {
    console.log('Deleting Flight', this.flight);
    //this.flightService.delete(this.flight._id);
  }
}
