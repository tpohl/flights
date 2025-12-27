import { AuthService } from '../services/auth.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Observable } from 'rxjs';
import { map, filter, switchMap } from 'rxjs/operators';
import { Flight } from '../models/flight';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-flights-export',
  templateUrl: './flights-export.component.html',
  styleUrls: ['./flights-export.component.css']
})
export class FlightsExportComponent implements OnInit {

  flights$!: Observable<Flight[]>;

  private authService = inject(AuthService);
  private db = inject(AngularFireDatabase);

  constructor() {
  }

  ngOnInit() {
    this.flights$ = toObservable(this.authService.user).pipe(
      filter(user => !!user),
      switchMap(user => {
        const flightList = this.db.list<Flight>('users/' + user!.uid + '/flights');
        return flightList.snapshotChanges();
      }),
      map(snapshots =>
        snapshots.map(c => {
          const f = c.payload.val();
          if (f) {
            f._id = c.key;
            return f;
          }
          return null;
        }).filter(f => f !== null) as Flight[]
      )
    );
  }

  flightsToClipbord() {
    this.flights$.pipe(map(flightsArray => JSON.stringify(flightsArray))).subscribe(this.copyToClipboard);
  }

  flightSearchToClipbord() {
    this.flights$.pipe(map(flightsArray => this.flightsForFlightSearch(flightsArray))).subscribe(this.copyToClipboard);
  }

  flightsForFlightSearch(flightsArray: Flight[]): string {
    console.log('Flights');
    let script = '';

    flightsArray.forEach(flight => {
      if (!flight._deleted && !!flight.flightno) {
        const flightSearchPayload = {
          DepAp: flight.from,
          ArrAp: flight.to,
          Duration: flight.durationMilliseconds / 1000 / 60, // FlightSearch is using minutes
          FlightNumber: flight.flightno.substring(2),
          Carrier: flight.flightno.substring(0, 2),
          Compartment: flight.class,
          Comment: `AC: ${flight.aircraftRegistration} \nSeat: ${flight.seat}`,
          IsPrivate: flight.reason === 'L',
          FlightDate: flight.date
        };

        const flightScript = `curl --request POST --url https://flightsearch.app/flightsearchapi/api/diariesmanual --header 'Accept: */*'  --header "Authorization: Bearer $token"  --header 'Content-Type: application/json; charset=utf-8'  --data '${JSON.stringify(flightSearchPayload)}' \n`;
        script += '\n' + flightScript;
      }
    });
    return script;

  }

  private copyToClipboard(val: string) {
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
  }
}
