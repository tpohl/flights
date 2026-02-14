import { Flight } from "../models/flight";
import * as admin from "firebase-admin";
// All available logging functions
const {
  log,
} = require('firebase-functions/logger');
const saveFlightAndReturnIt = async function(flightRef: admin.database.Reference, newFlight: Flight) {
  log("Saving Flight", newFlight);
  await flightRef.set(newFlight);
  return newFlight;
};

export default saveFlightAndReturnIt;
