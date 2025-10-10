import { Pipe, PipeTransform } from '@angular/core';
import { Flight } from '../models/flight';


import { CommonModule } from '@angular/common';

@Pipe({ standalone: true, name: 'flightDistance' })
export class FlightDistancePipe implements PipeTransform {
  transform(value: Flight, ...args: string[]): number {
    return flightDistance(value);
  }
}

export const flightDistance = function(value: Flight){
  if (!!value) {
    if (!!value.flownDistance){
      return value.flownDistance;
    } else {
      return  parseFloat('' + value.distance);
    }
  } else {
    return 0;
  }
}
