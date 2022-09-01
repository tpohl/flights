import { Component, OnInit } from '@angular/core';
import { Flight } from 'functions/src/models/flight';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import * as moment from 'moment-timezone';
import { flatMap, take, map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-pohl-rocks-importer',
  templateUrl: './pohl-rocks-importer.component.html',
  styleUrls: ['./pohl-rocks-importer.component.css']
})
export class PohlRocksImporterComponent implements OnInit {

  importJson: string;

  flights: Array<Flight>;

  userId: string;

  constructor(private db: AngularFireDatabase, private afAuth: AngularFireAuth) { }

  ngOnInit() {
    this.afAuth.user.subscribe(user => {
      this.userId = user.uid;
    });
    this.flights = [];
  }

  parseFlights() {
    console.log('JSON', this.importJson);
    this.flights = JSON.parse(this.importJson);
    console.log('Imported: ', this.flights.length);
  }

  removeDuplicateImports() {
    if (confirm("Are you sure to delete all duplicate Imports")) {
      this.afAuth.user.pipe(
        flatMap(user => this.db.list('users/' + user.uid + '/flights').snapshotChanges()),
        take(1),
        map(snapshots =>
          snapshots.map(c => {
            const f = c.payload.val() as Flight;
            f._id = c.key;
            return f;
          }) as Flight[])
      ).subscribe(flightArr => {

        flightArr.forEach(flight => {
          const importedId = flight['importedId'];

          if (importedId) {
            const flightsWithImportedId = flightArr.filter(f => (importedId === f['importedId']));
            if (flightsWithImportedId.length > 1) {

              const idToDelete = flightsWithImportedId[1]._id;
              const ref = 'users/' + this.userId + '/flights/' + idToDelete;
              console.log('Deleting Dup', ref);
              this.db.object<Flight>(ref).remove().then(value => {
                console.log('Deleted Object', value);
              });
            }
          }
        });
      });

    }
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
