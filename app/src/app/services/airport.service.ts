import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { AngularFireDatabase } from '@angular/fire/compat/database';

import { Airport } from '../models/airport';
import { shareReplay } from 'rxjs/operators';

@Injectable()
export class AirportService {

  private airports = new Map<String, Observable<Airport>>();

  private db = inject(AngularFireDatabase);
  private injector = inject(Injector);

  constructor() {  }

  public loadAirport(airportCode: String): Observable<Airport> {
    let airport$ = this.airports.get(airportCode);
    if (airport$) return airport$;

    const objectRef = '/airports/' + airportCode;
    // run inside injection context because compat database relies on AngularFire injection
    airport$ = runInInjectionContext(this.injector, () => this.db.object<Airport>(objectRef).valueChanges()).pipe(shareReplay());
    this.airports.set(airportCode, airport$);
    return airport$;
  }

}
