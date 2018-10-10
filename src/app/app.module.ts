import { DatepickerComponent } from './datepicker/datepicker.component';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { MomentModule } from 'ngx-moment';
import { AppComponent } from './app.component';
import { AngularFireModule } from 'angularfire2';
import { environment } from '../environments/environment';
import { AngularFireAuthModule } from 'angularfire2/auth';
import { AngularFireDatabaseModule } from 'angularfire2/database';
import { FlightListComponent } from './flight-list/flight-list.component';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { FlightEditComponent } from './flight-edit/flight-edit.component';
import { AirportService} from './services/airport.service';
import { CesiumDirective } from './cesium.directive';
import { CommonModule } from '@angular/common';
import { ExactDurationPipe } from './pipes/exactDurationPipe';
import { AmazingTimePickerModule } from 'amazing-time-picker';
import { PohlRocksImporterComponent } from './pohl-rocks-importer/pohl-rocks-importer.component';


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
    CesiumDirective,
    AppComponent,
    FlightListComponent,
    FlightEditComponent,
    DatepickerComponent,
    ExactDurationPipe,
    PohlRocksImporterComponent
  ],
  imports: [
    RouterModule.forRoot(
      appRoutes,
      { enableTracing: false } // <-- enable for debugging purposes only
    ),
    CommonModule,
    BrowserModule,
    FormsModule,
    MomentModule,
    AmazingTimePickerModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAuthModule,
    AngularFireDatabaseModule
  ],
  providers: [AirportService],
  bootstrap: [AppComponent]
})
export class AppModule { }
