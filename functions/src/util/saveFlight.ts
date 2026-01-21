import { Flight } from "./../models/flight";
import * as admin from "firebase-admin";
import { from } from "rxjs";
import { map } from "rxjs/operators";
// All available logging functions
const {
  log,
  info,
  debug,
  warn,
  error,
  write
} = require('firebase-functions/logger');
const saveFlightAndReturnIt = async function(flightRef: admin.database.Reference, newFlight: Flight) {
  log("Saving Flight", newFlight);
  await flightRef.set(newFlight);
  return newFlight;
};

export default saveFlightAndReturnIt;
