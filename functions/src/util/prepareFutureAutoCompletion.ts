import { Flight } from "../models/flight";
import * as admin from "firebase-admin";
import * as jwt from "jsonwebtoken";

// Declare fetch for Node 20+ native fetch support
declare const fetch: typeof globalThis.fetch;

// All available logging functions
const {
  log,
  info,
  debug,
  warn,
  error,
  write
} = require('firebase-functions/logger');

const functions = require('firebase-functions');
const { defineJsonSecret } = require('firebase-functions/params');

const config = defineJsonSecret("FLIGHTS_CONFIG");

const prepareFutureAutoCompletion = (flightRef: admin.database.Reference) => {
  return async (flight: Flight): Promise<Flight> => {
    log("PREPPING Future Auto-Completion");
    const arrival = new Date(flight.arrivalTime);
    if (arrival.getTime() > Date.now()) {
      const flightId = flightRef.key;
      const userId = flightRef.parent.parent.key;
      await doPrepareFutureAutoCompletion(userId, flightId, arrival);
    } else {
      log("Not preparing because the Flight has already landed.");
    }
    return flight;
  };
};

const doPrepareFutureAutoCompletion = async (userId: string, flightId: string, estimatedDate: Date) => {
  // Access secret value at runtime, not at module load time
  const JWTSECRET = config.value().jwt.secret;

  const autocompletion = {
    flightId,
    userId,
    exp: (estimatedDate.getTime() + (60 * 60 * 1000)) / 1000,
  };

  log("Payload", autocompletion);
  const token = jwt.sign(autocompletion, JWTSECRET);
  log("JWT signed", token);

  const url = "https://callmelater.pohl.rocks/tasks";

  // Schedule this task
  const task = {
    url: "https://flights.pohl.rocks/autocomplete",
    payload: token,
    scheduled_date: (Math.max(estimatedDate.getTime() + (10 * 60 * 1000), Date.now()) + (10 * 60 * 1000)),
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    log("Response Code from callmelater", response.status);
  } catch (error) {
    error("Error calling callmelater", error);
  }
};

export default prepareFutureAutoCompletion;
