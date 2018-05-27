import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { AngularFireDatabase } from 'angularfire2/database';

import { Airport } from '../models/airport';

@Injectable()
export class AirportService {

  constructor(private db: AngularFireDatabase) {  }

  public loadAirport(airportCode: String): Observable<Airport> {
    const objectRef = '/airports/' + airportCode;
    const dbObject = this.db.object<Airport>(objectRef);
    return dbObject.valueChanges();

  }

}
