import { Component, Input, OnInit } from '@angular/core';
import { Flight } from '../models/flight';

@Component({
  selector: 'app-seat-info',
  templateUrl: './seat-info.component.html',
  styleUrls: ['./seat-info.component.scss']
})
export class SeatInfoComponent implements OnInit {

  @Input()
  flight: Flight;

  constructor() { }

  ngOnInit(): void {
  }

  translateClass(travelClass: string){
    return TRAVEL_CLASSES[travelClass].short;
  }
  cssClass(travelClass: string){
    return TRAVEL_CLASSES[travelClass].cssClass;
  }
}
export interface ClassInfo {
  key: string;
  short: string;
  long: string
  cssClass: string;
}
export const TRAVEL_CLASSES: { [key: string]: ClassInfo } = {
  Y: { key: 'Y', short: 'ECO', long: 'Economy', cssClass: 'is-success' },
  M: { key: 'M', short: 'ECO+', long: 'Premium Economy', cssClass: 'is-primary' },
  C: { key: 'C', short: 'BIZ', long: 'Business', cssClass: 'is-info' },
  F: { key: 'F', short: '1ST', long: 'First Class', cssClass: 'is-danger' },
  J: { key: 'J', short: 'JMP', long: 'Jump Seat', cssClass: 'is-warning' },
  P: { key: 'P', short: 'CPIT', long: 'Cockpit', cssClass: 'is-link' } // Cockpit
}
