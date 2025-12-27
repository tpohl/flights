import { Routes } from '@angular/router';
import { FlightListComponent } from './flight-list/flight-list.component';
import { FlightEditComponent } from './flight-edit/flight-edit.component';
import { PohlRocksImporterComponent } from './pohl-rocks-importer/pohl-rocks-importer.component';
import { FlightsExportComponent } from './flights-export/flights-export.component';
import { OverallStatsComponent } from './overall-stats/overall-stats.component';
import { authGuard } from './auth.guard';
import { WelcomeComponent } from './welcome/welcome.component';
import { publicGuard } from './public.guard';

export const routes: Routes = [
  {
    path: 'welcome',
    component: WelcomeComponent,
    canActivate: [publicGuard]
  },
  {
    path: 'flights',
    component: FlightListComponent,
    canActivate: [authGuard]
  },
  {
    path: 'stats',
    component: OverallStatsComponent,
    canActivate: [authGuard]
  },
  {
    path: 'flight/:flightId',
    component: FlightEditComponent,
    canActivate: [authGuard]
  },
  {
    path: 'import/pohl.rocks',
    component: PohlRocksImporterComponent,
    canActivate: [authGuard]
  },
  {
    path: 'export',
    component: FlightsExportComponent,
    canActivate: [authGuard]
  },
  {
    path: '',
    redirectTo: '/flights',
    pathMatch: 'full'
  }
];