// This file can be replaced during build by using the `fileReplacements` array.
// `ng build ---prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  firebase:{
    apiKey: "AIzaSyBZzVZKx71SA3GXOTHkd7Gy07BO6qInfpc",
    authDomain: "flights-159420.firebaseapp.com",
    databaseURL: "https://flights-159420.firebaseio.com",
    projectId: "flights-159420",
    storageBucket: "flights-159420.appspot.com",
    messagingSenderId: "732553597334",
    automaticDataCollectionEnabled: false,
  }
};

/*
 * In development mode, to ignore zone related error stack frames such as
 * `zone.run`, `zoneDelegate.invokeTask` for easier debugging, you can
 * import the following file, but please comment it out in production mode
 * because it will have performance impact when throw error
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
