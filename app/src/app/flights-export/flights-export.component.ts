import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Flight } from '../models/flight';
import { FlightsService } from '../services/flights.service';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
  selector: 'app-flights-export',
  templateUrl: './flights-export.component.html',
  styleUrls: ['./flights-export.component.css']
})
export class FlightsExportComponent implements OnInit {

  private flightsService = inject(FlightsService);
  flights = this.flightsService.flights;

  constructor() {
  }

  ngOnInit() {
  }

  flightsToClipbord() {
    this.copyToClipboard(JSON.stringify(this.flightsService.flights()));
  }

  flightSearchToClipbord() {
    this.copyToClipboard(this.flightsForFlightSearch(this.flightsService.flights()));
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
