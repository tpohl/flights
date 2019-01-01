import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { AngularFireDatabase } from '@angular/fire/database';

import { Airport } from '../models/airport';
import { shareReplay } from 'rxjs/operators';

@Injectable()
export class AirportService {

  private airports = new Map<String, Observable<Airport>>();

  constructor(private db: AngularFireDatabase) {  }

  public loadAirport(airportCode: String): Observable<Airport> {
    let airport$ = this.airports.get(airportCode);
    if (airport$) return airport$;

    const objectRef = '/airports/' + airportCode;
    const dbObject = this.db.object<Airport>(objectRef);
    airport$ = dbObject.valueChanges().pipe(shareReplay());
    this.airports.set(airportCode, airport$);
    return airport$;
  }

}
