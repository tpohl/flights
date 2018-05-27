import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { AngularFireModule } from 'angularfire2';
import { environment } from '../environments/environment';
import { AngularFireAuthModule } from 'angularfire2/auth';
import { AngularFireDatabaseModule } from 'angularfire2/database';
import { FlightListComponent } from './flight-list/flight-list.component';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { FlightEditComponent } from './flight-edit/flight-edit.component';
import { AirportService} from './services/airport.service'


const appRoutes: Routes = [
  {
    path: 'flights',
    component: FlightListComponent
  },
  {
    path: 'flight/:flightId',
    component: FlightEditComponent
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
    redirectTo: '/home',
    pathMatch: 'full'
  }

];

@NgModule({
  declarations: [
    AppComponent,
    FlightListComponent,
    FlightEditComponent
  ],
  imports: [
    RouterModule.forRoot(
      appRoutes,
      { enableTracing: false } // <-- enable for debugging purposes only
    ),
    BrowserModule,
    FormsModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAuthModule,
    AngularFireDatabaseModule
  ],
  providers: [AirportService],
  bootstrap: [AppComponent]
})
export class AppModule { }
