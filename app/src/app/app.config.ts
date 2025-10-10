import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideDatabase, getDatabase } from '@angular/fire/database';
import { AngularFireModule, FIREBASE_OPTIONS } from '@angular/fire/compat';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AngularFireDatabaseModule } from '@angular/fire/compat/database';
import { Environment } from '../environments/environment';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ServiceWorkerModule } from '@angular/service-worker';
import { AirportService } from './services/airport.service';
import { FlightsService } from './services/flights.service';

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(
      BrowserModule,
      FormsModule,
      ServiceWorkerModule.register('ngsw-worker.js', {
        enabled: Environment.production,
        registrationStrategy: 'registerWhenStable:30000'
      }),
      AngularFireModule.initializeApp(Environment.firebase),
      AngularFireAuthModule,
      AngularFireDatabaseModule
    ),
    provideRouter(routes, withComponentInputBinding()),
    provideFirebaseApp(() => initializeApp(Environment.firebase)),
    provideAuth(() => getAuth()),
    provideDatabase(() => getDatabase()),
    AirportService,
    FlightsService,
    { provide: FIREBASE_OPTIONS, useValue: Environment.firebase }
  ]
};