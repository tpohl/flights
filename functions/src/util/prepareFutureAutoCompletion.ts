import { Flight } from "./../models/flight";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { from, of } from "rxjs";
import { map } from "rxjs/operators";
import * as jwt from "jsonwebtoken";

const jwtsecret = process.env.JWT_SECRET;

const prepareFutureAutoCompletion = (flightRef: admin.database.Reference) => {
  return (flight: Flight) => {
    console.log("PREPPING Future Auto-Completion");
    const arrival = new Date(flight.arrivalTime);
    if (arrival.getTime() > Date.now()) {
      const flightId = flightRef.key;
      const userId = flightRef.parent.parent.key;
      return from(doPrepareFutureAutoCompletion(userId, flightId, arrival))
        .pipe(map(() => flight));
    } else {
      console.log("Not preparing because the Flight has already landed.");
      return of(flight);
    }
  };
};

const doPrepareFutureAutoCompletion = async (userId: string, flightId: string, estimatedDate: Date) => {
  const autocompletion = {
    flightId,
    userId,
    exp: (estimatedDate.getTime() + (60 * 60 * 1000)) / 1000,
  };

  console.log("Payload", autocompletion);
  const token = jwt.sign(autocompletion, jwtsecret);
  console.log("JWT signed", token);

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
    console.log("Response Code from callmelater", response.status);
  } catch (error) {
    console.error("Error calling callmelater", error);
  }
};

export default prepareFutureAutoCompletion;
