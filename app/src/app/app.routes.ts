import { Routes } from '@angular/router';
import { FlightListComponent } from './flight-list/flight-list.component';
import { FlightEditComponent } from './flight-edit/flight-edit.component';
import { PohlRocksImporterComponent } from './pohl-rocks-importer/pohl-rocks-importer.component';
import { FlightsExportComponent } from './flights-export/flights-export.component';
import { OverallStatsComponent } from './overall-stats/overall-stats.component';

export const routes: Routes = [
  {
    path: 'flights',
    component: FlightListComponent
  },
    {
    path: 'stats',
    component: OverallStatsComponent
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
  {
    path: '',
    redirectTo: '/flights',
    pathMatch: 'full'
  }
];