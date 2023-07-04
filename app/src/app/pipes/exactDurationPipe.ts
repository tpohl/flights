import { Pipe, PipeTransform } from '@angular/core';

import DayJS from 'dayjs';
import DayJSDuration from 'dayjs/plugin/duration';

DayJS.extend(DayJSDuration);

@Pipe({ name: 'amDurationExact' })
export class ExactDurationPipe implements PipeTransform {
  transform(value: any, ...args: string[]): string {
    if (!!value) {
      const duration = DayJS.duration(value);
      if (value > 24 * 60 * 60 * 1000) {
        // More than one day - humanize
        return `${Math.floor(duration.asDays())} Days ${duration.hours()} Hours`;
      } else {
        return duration.format('HH:mm');
      }
    } else {
      return '';
    }
  }
}
