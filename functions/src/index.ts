import * as functions from 'firebase-functions';

import flightAutoComplete from './autocomplete/flight-autocomplete.server.service';

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

// Listens for new messages added to /messages/:pushId/original and creates an
// uppercase version of the message to /messages/:pushId/uppercase

exports.flightNoUppercase = functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
  .onUpdate((change, context) => {
    // Grab the current value of what was written to the Realtime Database.
    const originalFlight = change.after.val();
    console.log('Uppercasing Flight No', context.params.userId, context.params.flightId, originalFlight);

    const uppercase = originalFlight.toUpperCase();
    // You must return a Promise when performing asynchronous tasks inside a Functions such as
    // writing to the Firebase Realtime Database.
    // Setting an "uppercase" sibling in the Realtime Database returns a Promise.
    return change.after.ref.set(uppercase);
  });

exports.flightAutoComplete = functions.database.ref('/users/{userId}/flights/{flightId}/flightno')
  .onUpdate((change, context) => {
    const flightNo = change.after.val();
    return new Promise((resolve, reject) => {
      flightAutoComplete.autocomplete(flightNo).subscribe(flight => {
        console.log('Autocompleted Flight', flight);
        return change.after.ref.parent.child("autocompletes").set(flight);
      }, (error) => {
        console.log("ERROR AC", error);
        reject(error);
      });
    });

  });
