import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { AuthService } from '../services/auth.service';
import dayjs from 'dayjs/esm';
import { take, map, mergeMap } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';

import { Flight } from './../models/flight';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatTooltipModule
  ],
  selector: 'app-pohl-rocks-importer',
  templateUrl: './pohl-rocks-importer.component.html',
  styleUrls: ['./pohl-rocks-importer.component.css']
})
export class PohlRocksImporterComponent implements OnInit {

  importJson!: string;

  flights!: Array<Flight>;

  userId!: string;

  private authService = inject(AuthService);
  private db = inject(AngularFireDatabase);

  constructor() { }

  ngOnInit() {
    toObservable(this.authService.user).subscribe(user => {
      this.userId = user?.uid || '';
    });
    this.flights = [];
  }

  parseFlights() {
    console.log('JSON', this.importJson);
    this.flights = JSON.parse(this.importJson);
    console.log('Imported: ', this.flights.length);
  }

  removeDuplicateImports() {
    if (confirm('Are you sure to delete all duplicate Imports')) {
      toObservable(this.authService.user).pipe(
        mergeMap(user => this.db.list('users/' + user!.uid + '/flights').snapshotChanges()),
        take(1),
        map(snapshots =>
          snapshots.map(c => {
            const f = c.payload.val() as Flight;
            if (f) f._id = c.key;
            return f;
          }).filter(f => !!f) as Flight[])
      ).subscribe(flightArr => {

        flightArr.forEach(flight => {
          const importedId = (flight as any)['importedId'];

          if (importedId) {
            const flightsWithImportedId = flightArr.filter(f => (importedId === (f as any)['importedId']));
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
    toObservable(this.authService.user).subscribe(user => {
      // this.db.list('users/' + user.uid + '/flights').remove();
    });
  }

  importFlights(): void {
    console.log('Saving Flights', this.flights);
    toObservable(this.authService.user).subscribe(user => {
      const flightList = this.db.list<Flight>('users/' + user!.uid + '/flights');
      this.flights.forEach(flight => {
        (flight as any)[`importedId`] = flight['_id'];
        flight.date = dayjs(flight.departureTime).startOf('day').format('YYYY-MM-DD');
        flightList.push(flight);
      });

    }, error => {
      console.log(error);
    });
  }

}
