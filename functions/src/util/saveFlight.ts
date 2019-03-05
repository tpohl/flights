import { Flight } from './../models/flight';
import * as admin from 'firebase-admin';
import { from } from 'rxjs';
import { map } from 'rxjs/operators';

const saveFlightAndReturnIt = function (flightRef: admin.database.Reference) {
  return (newFlight: Flight) =>
    from(flightRef.set(newFlight)) // This is a promise
      .pipe(
        map(() => newFlight)
      );
}

export default saveFlightAndReturnIt;
