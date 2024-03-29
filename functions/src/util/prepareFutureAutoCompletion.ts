
import { Flight } from './../models/flight';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { RxHR } from '@akanass/rx-http-request';
import * as jwt from 'jsonwebtoken';

const config = functions.config();
const jwtsecret = config.jwt.secret;

const prepareFutureAutoCompletion = function(flightRef: admin.database.Reference){
  return (flight: Flight) => {
  console.log('PREPPING');
  const arrival = new Date(flight.arrivalTime);
  if (arrival.getTime() > Date.now()) {
    const flightId = flightRef.key;
    const userId = flightRef.parent.parent.key;
    return doPrepareFutureAutoCompletion(userId, flightId, arrival)
      .pipe(map(result => flight));
  } else {
    console.log('Not preparing because the Flight has already landed.');
    return of(flight);
  }
}
}

const doPrepareFutureAutoCompletion = function (userId: string, flightId: string, estimatedDate: Date) {
  const autocompletion = {};
  autocompletion['flightId'] = flightId;
  autocompletion['userId'] = userId;
  autocompletion['exp'] = (estimatedDate.getTime() + (60 * 60 * 1000)) / 1000;
  // TODO NotBefore autocompletion['nbf'] = (estimatedDate.getTime() + 60000) / 1000;
  console.log('Payload', autocompletion);
  const token = jwt.sign(autocompletion, jwtsecret);
  console.log('JWT signed', token);
  // TODO call callmelater and POST the token

  const url = 'https://callmelater.pohl.rocks/tasks'

  // Schedule this task
  const task = {
    "url": "https://flights.pohl.rocks/autocomplete",
    "payload": token,
    "scheduled_date": (Math.max(estimatedDate.getTime() + (10 * 60 * 1000), Date.now()) + (10 * 60 * 1000))
  }

  return RxHR.post(url, {
    body: task,
    json: true
  }).pipe(tap(response => {
    console.log('Response Code from callmelater', response.response.statusCode);
  }));
}


export default prepareFutureAutoCompletion;
