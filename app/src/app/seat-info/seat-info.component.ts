import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Flight, TRAVEL_CLASSES } from '../models/flight';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  imports: [CommonModule, MatChipsModule],
  selector: 'app-seat-info',
  templateUrl: './seat-info.component.html',
  styleUrls: ['./seat-info.component.scss']
})
export class SeatInfoComponent {

  flight = input.required<Flight>();

  constructor() { }

  translateClass(travelClass: string) {
    return TRAVEL_CLASSES.get(travelClass)?.short;
  }

  cssClass(travelClass: string) {
    return TRAVEL_CLASSES.get(travelClass)?.cssClass;
  }
}
