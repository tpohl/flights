import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Flight } from '../models/flight';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  standalone: true,
  imports: [CommonModule, MatChipsModule],
  selector: 'app-seat-info',
  templateUrl: './seat-info.component.html',
  styleUrls: ['./seat-info.component.scss']
})
export class SeatInfoComponent implements OnInit {

  @Input()
  flight!: Flight;

  constructor() { }

  ngOnInit(): void {
  }

  translateClass(travelClass: string) {
    return TRAVEL_CLASSES.get(travelClass)?.short;
  }
  cssClass(travelClass: string) {
    return TRAVEL_CLASSES.get(travelClass)?.cssClass;
  }
}
export interface ClassInfo {
  key: string;
  short: string;
  long: string
  cssClass: string;
}
export const TRAVEL_CLASSES: Map<string, ClassInfo> = new Map(Object.entries({
  Y: { key: 'Y', short: 'ECO', long: 'Economy', cssClass: 'class-y' },
  M: { key: 'M', short: 'ECO+', long: 'Premium Economy', cssClass: 'class-m' },
  C: { key: 'C', short: 'BIZ', long: 'Business', cssClass: 'class-c' },
  F: { key: 'F', short: '1ST', long: 'First Class', cssClass: 'class-f' },
  J: { key: 'J', short: 'JMP', long: 'Jump Seat', cssClass: 'class-j' },
  P: { key: 'P', short: 'CPIT', long: 'Cockpit', cssClass: 'class-p' }
}));
