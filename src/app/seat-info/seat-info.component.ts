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
    return travelClassMap[travelClass];
  }
}

const travelClassMap = {
  Y: 'ECO',
  M: 'ECO+',
  C: 'BIZ',
  F: '1ST'
}