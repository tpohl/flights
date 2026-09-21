import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import dayjs from 'dayjs';
import { finalize, forkJoin, map, of, take } from 'rxjs';
import { Flight } from '../models/flight';
import { Airport } from '../models/airport';
import { AirportService } from '../services/airport.service';
import { FlightsService } from '../services/flights.service';
import { exportMyFlightradar24 } from '../services/myflightradar24';

@Component({
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
  selector: 'app-flights-export',
  templateUrl: './flights-export.component.html',
  styleUrls: ['./flights-export.component.scss']
})
export class FlightsExportComponent {
  private flightsService = inject(FlightsService);
  private airportService = inject(AirportService);
  activeFlights = computed(() =>
    this.flightsService.allFlightsIncludingInvalidAndDeleted().filter(flight => !flight._deleted)
  );
  exporting = signal(false);
  exportMessage = signal('');

  flightsToClipbord() {
    this.copyToClipboard(JSON.stringify(this.activeFlights()));
  }

  downloadMyFlightradar24(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.exportMessage.set('');
    const flights = this.activeFlights();
    const codes = [...new Set(flights.flatMap(flight => [flight.from, flight.to]).filter(Boolean))];
    const airports$ = codes.length ? forkJoin(codes.map(code =>
      this.airportService.loadAirport(code).pipe(take(1), map(airport => [code, airport] as const))
    )) : of([]);
    airports$.pipe(finalize(() => this.exporting.set(false))).subscribe({
      next: entries => {
        const airportEntries = entries as readonly (readonly [string, Airport | null])[];
        const airports = new Map(airportEntries.filter((entry): entry is readonly [string, Airport] => !!entry[1]));
        const result = exportMyFlightradar24(flights, airports);
        const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `myflightradar24-flights-${dayjs().format('YYYY-MM-DD')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        this.exportMessage.set(`Exported ${result.exported} flights; skipped ${result.skipped} incomplete flights.`);
      },
      error: () => this.exportMessage.set('Airport data could not be loaded, so the CSV was not created.')
    });
  }

  flightSearchToClipbord() {
    this.copyToClipboard(this.flightsForFlightSearch(this.activeFlights()));
  }

  flightsForFlightSearch(flightsArray: Flight[]): string {
    let script = '';
    flightsArray.forEach(flight => {
      if (!flight._deleted && !!flight.flightno) {
        const flightSearchPayload = {
          DepAp: flight.from,
          ArrAp: flight.to,
          Duration: flight.durationMilliseconds / 1000 / 60,
          FlightNumber: flight.flightno.substring(2),
          Carrier: flight.flightno.substring(0, 2),
          Compartment: flight.class,
          Comment: `AC: ${flight.aircraftRegistration} \nSeat: ${flight.seat}`,
          IsPrivate: flight.reason === 'L',
          FlightDate: flight.date
        };
        script += `\ncurl --request POST --url https://flightsearch.app/flightsearchapi/api/diariesmanual --header 'Accept: */*'  --header "Authorization: ******"  --header 'Content-Type: application/json; charset=utf-8'  --data '${JSON.stringify(flightSearchPayload)}' \n`;
      }
    });
    return script;
  }

  private copyToClipboard(val: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(val);
    } else {
      const selBox = document.createElement('textarea');
      selBox.style.position = 'fixed';
      selBox.style.opacity = '0';
      selBox.value = val;
      document.body.appendChild(selBox);
      selBox.select();
      document.execCommand('copy');
      document.body.removeChild(selBox);
    }
  }
}
