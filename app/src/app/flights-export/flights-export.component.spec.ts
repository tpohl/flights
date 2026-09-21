import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AirportService } from '../services/airport.service';
import { FlightsService } from '../services/flights.service';
import { FlightsExportComponent } from './flights-export.component';

describe('FlightsExportComponent', () => {
  let component: FlightsExportComponent;
  let fixture: ComponentFixture<FlightsExportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlightsExportComponent],
      providers: [
        { provide: FlightsService, useValue: {
          allFlightsIncludingInvalidAndDeleted: signal([
            { _id: 'active', flightno: 'LH1' },
            { _id: 'deleted', flightno: 'LH2', _deleted: true }
          ])
        } },
        { provide: AirportService, useValue: { loadAirport: () => of(null) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(FlightsExportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps all active flights in the JSON export', () => {
    expect(component.activeFlights().map(flight => flight._id)).toEqual(['active']);
  });
});
