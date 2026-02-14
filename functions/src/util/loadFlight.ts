import { Flight } from "../models/flight";
import * as admin from "firebase-admin";

const loadFlight = async function(flightRef: admin.database.Reference): Promise<Flight> {
  const dateSnap = await flightRef.once("value");
  return dateSnap.val() as Flight;
};

export default loadFlight;
