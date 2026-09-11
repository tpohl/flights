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

  enrichmentIcon(flight: Flight): string {
    switch (flight.aeroApiEnrichment?.state) {
      case 'final': return 'check_circle';
      case 'scheduled': return 'schedule';
      case 'partial': return 'pending';
      case 'ambiguous': return 'help';
      case 'budget_blocked': return 'paid';
      case 'outside_window': return 'event_busy';
      default: return flight.aeroApiFlight ? 'check_circle' : 'cancel';
    }
  }

  enrichmentClass(flight: Flight): string {
    const state = flight.aeroApiEnrichment?.state;
    if (state === 'final' || (!state && flight.aeroApiFlight)) return 'success';
    if (state === 'scheduled' || state === 'partial') return 'warning';
    return 'error';
  }

  enrichmentLabel(flight: Flight): string {
    switch (flight.aeroApiEnrichment?.state) {
      case 'final': return 'Final';
      case 'scheduled': return 'Scheduled';
      case 'partial': return 'Awaiting final data';
      case 'ambiguous': return 'Needs route details';
      case 'not_found': return 'Not found';
      case 'outside_window': return 'Outside recent-data window';
      case 'budget_blocked': return 'Monthly budget protected';
      case 'error': return 'Lookup failed';
      default: return flight.aeroApiFlight ? 'Legacy data' : 'Not enriched';
    }
  }
}
