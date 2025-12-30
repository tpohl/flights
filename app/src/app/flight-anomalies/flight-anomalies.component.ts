import { Component, OnInit, Signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Flight } from '../models/flight';
import { FlightsService } from '../services/flights.service';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatRippleModule } from '@angular/material/core';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FlightTileComponent,
    ExactDurationPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatChipsModule,
    MatRippleModule
  ],
  selector: 'app-flight-anomalies',
  templateUrl: './flight-anomalies.component.html',
  styleUrls: ['./flight-anomalies.component.scss']
})
export class FlightAnomaliesComponent implements OnInit {
  private flightsService = inject(FlightsService);

  tooSlowFlights: Signal<Flight[]> = this.flightsService.tooSlowFlights;
  tooFastFlights: Signal<Flight[]> = this.flightsService.tooFastFlights;
  validatedAnomalies: Signal<Flight[]> = this.flightsService.validatedAnomalies;

  get totalAnomalies(): number {
    return this.tooSlowFlights().length + this.tooFastFlights().length;
  }

  get totalValidated(): number {
    return this.validatedAnomalies().length;
  }

  ngOnInit() {
  }

  calculateAverageSpeed(flight: Flight): number {
    return this.flightsService.getAverageSpeed(flight);
  }

  isSlowAnomaly(flight: Flight): boolean {
    return this.flightsService.isSlowAnomaly(flight);
  }
}
