import { Pipe, PipeTransform } from '@angular/core';
import * as moment from 'moment';

@Pipe({ name: 'amDurationExact' })
export class ExactDurationPipe implements PipeTransform {
  transform(value: any, ...args: string[]): string {
    if (typeof args === 'undefined' || args.length !== 1) {
      throw new Error('DurationPipe: missing required time unit argument');
    }
    const duration = moment.duration(value, args[0] as moment.unitOfTime.DurationConstructor);
    //return duration.get('hours') + ':' + duration.get('minutes');
    return moment.utc(duration.asMilliseconds()).format('HH:mm');
  }
}
