import { Routes } from '@angular/router';
import { FlightListComponent } from './flight-list/flight-list.component';
import { FlightEditComponent } from './flight-edit/flight-edit.component';
import { PohlRocksImporterComponent } from './pohl-rocks-importer/pohl-rocks-importer.component';
import { FlightsExportComponent } from './flights-export/flights-export.component';
import { OverallStatsComponent } from './overall-stats/overall-stats.component';
import { FlightAnomaliesComponent } from './flight-anomalies/flight-anomalies.component';
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
    path: 'anomalies',
    component: FlightAnomaliesComponent,
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
    path: 'settings',
    loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'trips',
    loadComponent: () => import('./trip-list/trip-list.component').then(m => m.TripListComponent),
    canActivate: [authGuard]
  },
  {
    path: 'trips/:id',
    loadComponent: () => import('./trip-detail/trip-detail.component').then(m => m.TripDetailComponent),
    canActivate: [authGuard]
  },
  {
    path: 'trip-wizard',
    loadComponent: () => import('./trip-wizard/trip-wizard.component').then(m => m.TripWizardComponent),
    canActivate: [authGuard]
  },
  {
    path: '',
    redirectTo: '/flights',
    pathMatch: 'full'
  }
];