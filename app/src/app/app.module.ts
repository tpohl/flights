import { DatepickerComponent } from './datepicker/datepicker.component';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { AppComponent } from './app.component';
import { Environment } from '../environments/environment';
import { FlightListComponent } from './flight-list/flight-list.component';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { FlightEditComponent } from './flight-edit/flight-edit.component';
import { AirportService } from './services/airport.service';
import { CesiumDirective } from './cesium.directive';
import { CommonModule } from '@angular/common';
import { ExactDurationPipe } from './pipes/exactDurationPipe';
import { PohlRocksImporterComponent } from './pohl-rocks-importer/pohl-rocks-importer.component';
import { FlightsExportComponent } from './flights-export/flights-export.component';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { FIREBASE_OPTIONS } from '@angular/fire/compat';
import { ServiceWorkerModule } from '@angular/service-worker';
import { FlightStatsComponent } from './flight-stats/flight-stats.component';
import { FlightsService } from './services/flights.service';
import { FlightTileComponent } from './flight-tile/flight-tile.component';
import { SeatInfoComponent } from './seat-info/seat-info.component';
import { RelativeTimePipe } from './pipes/relativeTimePipe';
import { FlightDistancePipe } from './pipes/flightDistancePipe';


const appRoutes: Routes = [
  {
    path: 'flights',
    component: FlightListComponent
  },
  {
    path: 'flight/:flightId',
    component: FlightEditComponent
  },
  {
    path: 'import/pohl.rocks',
    component: PohlRocksImporterComponent
  },
  {
    path: 'export',
    component: FlightsExportComponent
  },
  /*
  {
    path: 'home',
    component: FlightListComponent
  },
  {
    path: 'login',
    component: LoginComponent
  },*/
  {
    path: '',
    redirectTo: '/flights',
    pathMatch: 'full'
  }

];

@NgModule({
  declarations: [
    CesiumDirective,
    AppComponent,
    FlightListComponent,
    FlightEditComponent,
    FlightStatsComponent,
    DatepickerComponent,
    ExactDurationPipe,
    RelativeTimePipe,
    FlightDistancePipe,
    PohlRocksImporterComponent,
    FlightsExportComponent,
    FlightTileComponent,
    SeatInfoComponent
  ],
  imports: [
    RouterModule.forRoot(
      appRoutes,
      { enableTracing: false,  bindToComponentInputs: true }
    ),
    CommonModule,
    BrowserModule,
    FormsModule,
    provideFirebaseApp(() => initializeApp(Environment.firebase)),
    provideAuth(() => getAuth()),
    provideDatabase(() => getDatabase()),
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: Environment.production,
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
  providers: [AirportService, FlightsService, { provide: FIREBASE_OPTIONS, useValue: Environment.firebase }],
  bootstrap: [AppComponent]
})
export class AppModule {
}


