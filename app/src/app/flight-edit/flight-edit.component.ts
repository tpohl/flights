import { Location, LocationStrategy, PathLocationStrategy, CommonModule } from '@angular/common';
import { AirportService } from '../services/airport.service';
import { BehaviorSubject, filter, Observable, of, ReplaySubject, Subject, Subscription, combineLatest } from 'rxjs';

import { Component, Input, OnDestroy, OnInit, inject, effect, ViewChild, ElementRef, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FlightStatsComponent } from '../flight-stats/flight-stats.component';
import { RelativeTimePipe } from '../pipes/relativeTimePipe';
import { FlightDistancePipe } from '../pipes/flightDistancePipe';
import { CesiumDirective } from '../cesium.directive';

import { Flight, TRAVEL_CLASSES } from '../models/flight';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Airport } from '../models/airport';
import DayJS from 'dayjs';
import DayJSUtc from 'dayjs/plugin/utc';
import DayJSTimezone from 'dayjs/plugin/timezone';

DayJS.extend(DayJSUtc);
DayJS.extend(DayJSTimezone);

import { User } from 'firebase/auth';
import { FlightsService, SaveResultType } from '../services/flights.service';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';
import { FlightTileComponent } from '../flight-tile/flight-tile.component';


import { AuthService } from '../services/auth.service';
import { toObservable } from '@angular/core/rxjs-interop';

// Angular Material
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FlightTileComponent,
    FlightStatsComponent,
    RelativeTimePipe,
    FlightDistancePipe,
    CesiumDirective,
    ExactDurationPipe,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatRadioModule,
    MatDividerModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule
  ],
  selector: 'app-flight-edit',
  providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
  templateUrl: './flight-edit.component.html',
  styleUrls: ['./flight-edit.component.scss']
})
export class FlightEditComponent implements OnInit, OnDestroy {

  private authService = inject(AuthService);
  protected flightsService = inject(FlightsService);

  constructor(private route: ActivatedRoute,
    private router: Router, private db: AngularFireDatabase,
    private airportService: AirportService,
    flightsService: FlightsService,
    private location: Location) {
    this.flightsService = flightsService;
    effect(() => {
      const flight = this.flightsService.activeFlight();
      if (flight) {
        this.flight = flight;
        this.objectRef = flight._objectReference;
        if (this.flight.from) this.loadFromAirport(this.flight.from);
        if (this.flight.to) this.loadToAirport(this.flight.to);
        this.flightsForMap$.next([flight]);
      }
    });
  }



  @Input()
  set flightId(id: string | undefined) {
    this._flightId = id;
    this.initializeFlight();
  }
  get flightId(): string | undefined {
    return this._flightId;
  }
  private _flightId: string | undefined;

  flight: Flight | null = null;
  user: User | null = null;

  @ViewChild('formCard', { read: ElementRef }) formCard?: ElementRef;

  private initializeFlight() {
    if (!this.user) return;

    if (!this._flightId || this._flightId === 'new') {
      this.flightsService.activeFlight.set(null);
      this.objectRef = undefined;
      this.flight = new Flight();
      this.flight._id = null;
      this.flight.date = DayJS().format('YYYY-MM-DD');

      // Focus on the form when creating a new flight
      setTimeout(() => {
        if (this.formCard) {
          this.formCard.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else {
      this.loadFlight(this._flightId);
    }
  }

  departureTime = '00:00';
  arrivalTime = '00:00';

  TRAVEL_CLASSES_LIST = Array.from(TRAVEL_CLASSES.values());

  objectRef: string | undefined;

  fromAirport$: Subject<Airport> = new ReplaySubject<Airport>(1);
  toAirport$: Subject<Airport> = new ReplaySubject<Airport>(1);
  flightsForMap$: Subject<Flight[]> = new ReplaySubject<Flight[]>(1);

  private subs = new Subscription();




  private user$ = toObservable(this.authService.user);

  ngOnInit() {
    // Existing logic used: this.afAuth.user.subscribe(...)
    // Let's maintain that pattern by piping the signal.

    // Combine route params and user authentication to handle both together
    this.subs.add(combineLatest([
      this.route.params,
      this.user$
    ]).subscribe(([params, user]) => {
      this.user = user;
      if (params['flightId']) {
        this.flightId = params['flightId'];
      } else {
        this.flightId = undefined;
      }
    }));

    this.subs.add(this.fromAirport$.subscribe(fromAirport => {
      if (fromAirport && this.flight && this.flight.departureTime && fromAirport.timezoneId) {
        this.departureTime = DayJS(this.flight.departureTime).tz(fromAirport.timezoneId).format('HH:mm');
      }
    }));

    this.subs.add(this.toAirport$.subscribe(toAirport => {
      if (toAirport && this.flight && this.flight.arrivalTime && toAirport.timezoneId) {
        this.arrivalTime = DayJS(this.flight.arrivalTime).tz(toAirport.timezoneId).format('HH:mm');
      }
    }));
  }

  selectDepartureTime() {
    if (!!this.flight) {
      const time = this.departureTime;

      const dateWithWithTime = DayJS(this.flight.date).format('YYYY-MM-DD') + 'T' + time;
      this.fromAirport$
        .pipe(filter(ap => !!ap && !!ap.timezoneId))
        .subscribe(ap => {
          this.flight!.departureTime = DayJS.tz(dateWithWithTime, ap!!.timezoneId).clone().tz('UTC').format(); // '2013-06-01T00:00:00',
        });
    }
  }

  selectArrivalTime() {
    if (!!this.flight) {
      const time = this.arrivalTime;

      const dateWithWithTime = DayJS(this.flight.date).format('YYYY-MM-DD') + 'T' + time;
      this.toAirport$
        .pipe(filter(ap => !!ap && !!ap.timezoneId))
        .subscribe(ap => {
          this.flight!.arrivalTime = DayJS.tz(dateWithWithTime, ap!!.timezoneId).tz('UTC').format(); // '2013-06-01T00:00:00',
          if (this.flight!.arrivalTime < this.flight!.departureTime) { // When the arrival is BEFORE the Departure, then we add a day.
            this.flight!.arrivalTime = DayJS(this.flight!.arrivalTime).add(1, 'days').clone().tz('UTC').format();
          }
        });
    }
  }

  loadFlight(flightId: string) {
    this.flightsService.loadFlight(flightId).subscribe(
      (flight) => {
        if (!flight) {
          console.error('Flight not found: ' + flightId);
          this.router.navigateByUrl('/flights');
        }
      }
    );
  }

  selectedDate(momentDate: DayJS.Dayjs) {
    if (!!this.flight) {
      this.flight.date = momentDate.format('YYYY-MM-DD');
    }
  }

  loadAirport(code: String): Observable<Airport | null> {
    if (code && code.length === 3) {
      return this.airportService.loadAirport(code);
    } else {
      return of(null);
    }
  }

  loadFromAirport(code: String): Observable<Airport | null> {
    const ap = this.loadAirport(code);
    ap.subscribe((a) => {
      if (a) this.fromAirport$.next(a);
    });
    return ap;
  }

  loadToAirport(code: String): Observable<Airport | null> {
    const ap = this.loadAirport(code);
    ap.subscribe((a) => {
      if (a) this.toAirport$.next(a);
    });
    return ap;
  }

  autocomplete(): void {
    if (!!this.flight) {
      this.flight.needsAutocomplete = (!this.flight.needsAutocomplete);
      this.save();
    }
  }

  onDateChange(event: any): void {
    if (!!this.flight && event.value) {
      this.flight.date = DayJS(event.value).format('YYYY-MM-DD');
    }
  }

  save(): void {
    if (!!this.flight) {

      const sub = this.flightsService.saveFlight(this.flight)
        .subscribe(result => {
          if (!!result && result.type === SaveResultType.CREATED) {
            const flightId = result.flightId;
            this.loadFlight(flightId);
            this.location.replaceState('flight/' + flightId);
          }
          sub.unsubscribe();
        });
    }
  }

  delete(): void {
    if (!!this.flight && !!this.objectRef) {
      this.flight._deleted = true;

      const sub = this.flightsService.saveFlight(this.flight)
        .subscribe(_ => {
          this.router.navigateByUrl('/flights');
          sub.unsubscribe();
        });
    } else {
      this.router.navigateByUrl('/flights');
    }
  }

  /**
   * Check if the flight is anomalously slow or fast
   */
  isFlightAnomaly(): boolean {
    return this.flight ? this.flightsService.isAnomalies(this.flight) : false;
  }

  /**
   * Check if flight is slow anomaly
   */
  isSlowAnomaly(): boolean {
    return this.flight ? this.flightsService.isSlowAnomaly(this.flight) : false;
  }

  /**
   * Check if flight is fast anomaly
   */
  isFastAnomaly(): boolean {
    return this.flight ? this.flightsService.isFastAnomaly(this.flight) : false;
  }

  /**
   * Toggle the validated anomaly flag and save
   */
  validateAnomaly(): void {
    if (this.flight) {
      this.flight.validatedAnomaly = !this.flight.validatedAnomaly;
      this.save();
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }
}

