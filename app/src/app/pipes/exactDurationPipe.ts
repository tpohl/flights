import { Pipe, PipeTransform } from '@angular/core';

import DayJS from 'dayjs';
import DayJSDuration from 'dayjs/plugin/duration';

DayJS.extend(DayJSDuration);

@Pipe({ name: 'amDurationExact' })
export class ExactDurationPipe implements PipeTransform {
  transform(value: any, ...args: string[]): string {
    if (typeof args === 'undefined' || args.length !== 1) {
      throw new Error('DurationPipe: missing required time unit argument');
    }
    if (!!value) {
      const duration = DayJS.duration(value);
      return duration.format('HH:mm');
    } else {
      return '';
    }
  }
}
