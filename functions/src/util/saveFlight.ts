import { Flight } from "./../models/flight";
import * as admin from "firebase-admin";
import { from } from "rxjs";
import { map } from "rxjs/operators";

const saveFlightAndReturnIt = async function(flightRef: admin.database.Reference, newFlight: Flight) {
  console.log("Saving Flight", newFlight);
  await flightRef.set(newFlight);
  return newFlight;
};

export default saveFlightAndReturnIt;
