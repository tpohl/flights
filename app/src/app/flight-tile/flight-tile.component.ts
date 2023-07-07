import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { Flight } from '../models/flight';

@Component({
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
