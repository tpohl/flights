import { DatepickerComponent } from './datepicker/datepicker.component';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { MomentModule } from 'ngx-moment';
import { AppComponent } from './app.component';
import { environment } from '../environments/environment';
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
    DatepickerComponent,
    ExactDurationPipe,
    PohlRocksImporterComponent,
    FlightsExportComponent
  ],
  imports: [
    RouterModule.forRoot(
      appRoutes,
      { enableTracing: false, relativeLinkResolution: 'legacy' } // <-- enable for debugging purposes only
      // <-- enable for debugging purposes only
    ),
    CommonModule,
    BrowserModule,
    FormsModule,
    MomentModule,
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideDatabase(() => getDatabase())
  ],
  providers: [AirportService, { provide: FIREBASE_OPTIONS, useValue: environment.firebase }],
  bootstrap: [AppComponent]
})
export class AppModule {
}


