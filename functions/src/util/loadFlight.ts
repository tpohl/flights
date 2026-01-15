import { Flight } from "./../models/flight";
import * as admin from "firebase-admin";
import { from } from "rxjs";
import { map } from "rxjs/operators";

const loadFlight = function(flightRef: admin.database.Reference) {
  return from(
    flightRef.once("value"))
    .pipe(
      map((dateSnap) => dateSnap.val() as Flight)
    );
};

export default loadFlight;
