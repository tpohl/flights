import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

import DayJS from 'DayJS';
import DayJSUtc from 'DayJS/plugin/utc';
import DayJSTimezone from 'DayJS/plugin/timezone';
import DayJSWeekday from 'DayJS/plugin/weekday';

DayJS.extend(DayJSUtc);
DayJS.extend(DayJSTimezone);
DayJS.extend(DayJSWeekday);


@Component({
  selector: 'app-datepicker',
  templateUrl: './datepicker.component.html',
  styleUrls: ['./datepicker.component.css']
})
export class DatepickerComponent implements OnInit {

  @Input() locale: string;
  @Input() canChangeNavMonthLogic: any;
  @Input() isAvailableLogic: any;
  @Input() open = false;

  @Output() emitSelectedDate = new EventEmitter<DayJS.Dayjs>();

  navDate: DayJS.Dayjs;
  weekDaysHeaderArr: Array<string> = [];
  gridArr: Array<any> = [];
  selectedDate: DayJS.Dayjs;

  constructor() {
  }

  toggle() {
    this.open = !open;
  }

  ngOnInit() {
    this.navDate = DayJS(); // .tz(this.locale);
    this.makeHeader();
    this.makeGrid();
  }

  changeNavMonth(num: number) {
    if (this.canChangeNavMonth(num)) {
      this.navDate.add(num, 'month');
      this.makeGrid();
    }
  }

  canChangeNavMonth(num: number) {
    if (this.canChangeNavMonthLogic) {
      const clonedDate = DayJS(this.navDate);
      return this.canChangeNavMonthLogic(num, clonedDate);
    } else {
      return true;
    }
  }

  makeHeader() {
    const weekDaysArr: Array<number> = [0, 1, 2, 3, 4, 5, 6];
    weekDaysArr.forEach(day => this.weekDaysHeaderArr.push(DayJS().weekday(day).format('ddd')));
  }

  makeGrid() {
    this.gridArr = [];

    const firstDayDate = DayJS(this.navDate).startOf('month');
    const initialEmptyCells = firstDayDate.weekday();
    const lastDayDate = DayJS(this.navDate).endOf('month');
    const lastEmptyCells = 6 - lastDayDate.weekday();
    const daysInMonth = this.navDate.daysInMonth();
    const arrayLength = initialEmptyCells + lastEmptyCells + daysInMonth;

    for (let i = 0; i < arrayLength; i++) {
      const obj: any = {};
      if (i < initialEmptyCells || i > initialEmptyCells + daysInMonth - 1) {
        obj.value = 0;
        obj.available = false;
      } else {
        obj.value = i - initialEmptyCells + 1;
        obj.available = this.isAvailable(i - initialEmptyCells + 1);
      }
      this.gridArr.push(obj);
    }
  }

  isAvailable(num: number): boolean {
    if (this.isAvailableLogic) {
      const dateToCheck = this.dateFromNum(num, this.navDate);
      return this.isAvailableLogic(dateToCheck);
    } else {
      return true;
    }
  }

  dateFromNum(num: number, referenceDate: any): any {
    const returnDate = DayJS(referenceDate);
    return returnDate.date(num);
  }

  selectDay(day: any) {
    if (day.available) {
      this.selectedDate = this.dateFromNum(day.value, this.navDate);
      this.emitSelectedDate.emit(this.selectedDate);
      this.open = false;
    }
  }

}
