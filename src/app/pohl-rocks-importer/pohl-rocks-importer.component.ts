import { Component, OnInit } from '@angular/core';
import { Flight } from 'functions/src/models/flight';
import { AngularFireDatabase } from '@angular/fire/database';
import { AngularFireAuth } from '@angular/fire/auth';
import * as moment from 'moment-timezone';

@Component({
  selector: 'app-pohl-rocks-importer',
  templateUrl: './pohl-rocks-importer.component.html',
  styleUrls: ['./pohl-rocks-importer.component.css']
})
export class PohlRocksImporterComponent implements OnInit {

  importJson: string;

  flights: Array<Flight>;

  constructor(private db: AngularFireDatabase, private afAuth: AngularFireAuth) { }

  ngOnInit() {
    this.flights = [];
  }

  parseFlights() {
    console.log('JSON', this.importJson);
    this.flights = JSON.parse(this.importJson);
    console.log('Imported: ', this.flights.length);
  }


  deleteAllMyFlights() {
    this.afAuth.user.subscribe(user => {
      const flightList = this.db.list('users/' + user.uid + '/flights').remove();
    });
  }

  importFlights(): void {
    console.log('Saving Flights', this.flights);
    this.afAuth.user.subscribe(user => {
      const flightList = this.db.list<Flight>('users/' + user.uid + '/flights');
      this.flights.forEach(flight => {
        flight[`importedId`] = flight['_id'];
        flight.date = moment(flight.departureTime).startOf('day').format('YYYY-MM-DD');
        flightList.push(flight);
      });

    }, error => {
      console.log(error);
    });
  }

}
