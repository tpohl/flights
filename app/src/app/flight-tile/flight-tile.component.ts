import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlightDistancePipe } from '../pipes/flightDistancePipe';
import { SeatInfoComponent } from '../seat-info/seat-info.component';
import { Flight } from '../models/flight';

// Angular Material
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

@Component({
    imports: [CommonModule, FlightDistancePipe, SeatInfoComponent, MatChipsModule, MatIconModule],
    selector: 'app-flight-tile',
    templateUrl: './flight-tile.component.html',
    styleUrls: ['./flight-tile.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlightTileComponent implements OnInit {

  @Input()
  flight: Flight;

  @Input()
  compact = false;

  constructor() { }

  ngOnInit(): void { }

}
