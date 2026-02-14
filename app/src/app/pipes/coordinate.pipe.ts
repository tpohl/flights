import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'coordinate',
  standalone: true
})
export class CoordinatePipe implements PipeTransform {

  transform(value: number | undefined | null, type: 'latitude' | 'longitude'): string {
    if (value === undefined || value === null) {
      return '';
    }

    const absoluteValue = Math.abs(value);
    const direction = this.getDirection(value, type);

    return `${absoluteValue.toFixed(2)}°${direction}`;
  }

  private getDirection(value: number, type: 'latitude' | 'longitude'): string {
    if (type === 'latitude') {
      return value >= 0 ? 'N' : 'S';
    } else {
      return value >= 0 ? 'E' : 'W';
    }
  }
}
