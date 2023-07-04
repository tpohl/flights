import { Pipe, PipeTransform } from '@angular/core';

import DayJS from 'dayjs';
import DayJSRelativeTime from 'dayjs/plugin/relativeTime';

DayJS.extend(DayJSRelativeTime);

@Pipe({ name: 'amTimeAgo' })
export class RelativeTimePipe implements PipeTransform {
  transform(value: any, ...args: string[]): string {
    if (!!value) {
      return DayJS(value).fromNow(false);
    } else {
      return '';
    }
  }
}
