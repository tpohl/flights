import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Database, ref } from '@angular/fire/database';
import { objectVal } from 'rxfire/database';

import { Airport } from '../models/airport';
import { shareReplay } from 'rxjs/operators';

@Injectable()
export class AirportService {

  private airports = new Map<String, Observable<Airport | null>>();
  private db = inject(Database);

  constructor() { }

  public loadAirport(airportCode: String): Observable<Airport | null> {
    let airport$ = this.airports.get(airportCode);
    if (airport$) return airport$;

    const objectRefStr = '/airports/' + airportCode;
    const airportRef = ref(this.db, objectRefStr);

    airport$ = objectVal<Airport>(airportRef).pipe(shareReplay());
    this.airports.set(airportCode, airport$);
    return airport$;
  }

}
