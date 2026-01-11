import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideDatabase, getDatabase } from '@angular/fire/database';
import { Environment } from '../environments/environment';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { FormsModule } from '@angular/forms';
import { ServiceWorkerModule } from '@angular/service-worker';
import { AirportService } from './services/airport.service';
import { FlightsService } from './services/flights.service';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(
      ServiceWorkerModule.register('ngsw-worker.js', {
        enabled: Environment.production,
        registrationStrategy: 'registerWhenStable:30000'
      })
    ),
    provideRouter(routes, withComponentInputBinding()),
    provideFirebaseApp(() => initializeApp(Environment.firebase)),
    provideAuth(() => getAuth()),
    provideDatabase(() => getDatabase()),
    provideAnimationsAsync()
  ]
};