import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Database, ref, push, remove } from '@angular/fire/database';
import { listVal } from 'rxfire/database';
import { AuthService } from '../services/auth.service';
import dayjs from 'dayjs';
import { take, map, filter } from 'rxjs/operators';
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
  styleUrls: ['./pohl-rocks-importer.component.scss']
})
export class PohlRocksImporterComponent implements OnInit {

  importJson!: string;
  flights: Array<Flight> = [];
  userId = signal<string>('');

  private authService = inject(AuthService);
  private db = inject(Database);

  constructor() {
    effect(() => {
      const user = this.authService.user();
      if (user) {
        this.userId.set(user.uid);
      }
    });
  }

  ngOnInit() {
  }

  parseFlights() {
    console.log('JSON', this.importJson);
    this.flights = JSON.parse(this.importJson);
    console.log('Imported: ', this.flights.length);
  }

  removeDuplicateImports() {
    if (confirm('Are you sure to delete all duplicate Imports')) {
      const user = this.authService.user();
      if (!user) return;

      const flightsRef = ref(this.db, 'users/' + user.uid + '/flights');
      listVal<Flight>(flightsRef, { keyField: '_id' }).pipe(
        take(1),
        map(flights => flights.filter(f => !!f))
      ).subscribe(flightArr => {
        flightArr.forEach(flight => {
          const importedId = (flight as any)['importedId'];

          if (importedId) {
            const flightsWithImportedId = flightArr.filter(f => (importedId === (f as any)['importedId']));
            if (flightsWithImportedId.length > 1) {
              const idToDelete = flightsWithImportedId[1]._id;
              const objectRef = ref(this.db, 'users/' + user.uid + '/flights/' + idToDelete);
              console.log('Deleting Dup', idToDelete);
              remove(objectRef).then(value => {
                console.log('Deleted Object', value);
              });
            }
          }
        });
      });
    }
  }

  deleteAllMyFlights() {
    // Logic currently disabled in original code
  }

  importFlights(): void {
    console.log('Saving Flights', this.flights);
    const user = this.authService.user();
    if (!user) return;

    const flightsRef = ref(this.db, 'users/' + user.uid + '/flights');
    this.flights.forEach(flight => {
      (flight as any)[`importedId`] = flight['_id'];
      flight.date = dayjs(flight.departureTime).startOf('day').format('YYYY-MM-DD');
      push(flightsRef, flight);
    });
  }

}
