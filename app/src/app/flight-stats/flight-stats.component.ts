import { Flight } from '../models/flight';
import { Component, input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';
import { FlightsService } from '../services/flights.service';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  imports: [
    CommonModule,
    FlightTileComponent,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    MatDividerModule,
    MatTooltipModule
  ],
  selector: 'app-flight-stats',
  templateUrl: './flight-stats.component.html',
  styleUrls: ['./flight-stats.component.scss']
})
export class FlightStatsComponent {
  private flightsService = inject(FlightsService);

  flight = input.required<Flight>();

  stats = toSignal(
    toObservable(this.flight).pipe(
      switchMap(f => this.flightsService.computeStats(f))
    )
  );

  track = toSignal(
    toObservable(this.flight).pipe(
      switchMap(f => this.flightsService.loadFlightTrack(f))
    )
  );

  flightsHidden = true;
}
