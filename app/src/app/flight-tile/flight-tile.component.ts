import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlightDistancePipe } from '../pipes/flightDistancePipe';
import { SeatInfoComponent } from '../seat-info/seat-info.component';
import { Flight } from '../models/flight';

@Component({
  standalone: true,
  imports: [CommonModule, FlightDistancePipe, SeatInfoComponent],
  selector: 'app-flight-tile',
  templateUrl: './flight-tile.component.html',
  styleUrls: ['./flight-tile.component.css'],
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
