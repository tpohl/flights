import { TestBed } from '@angular/core/testing';
import { FlightsService } from './flights.service';
import { AirportService } from './airport.service';
import { Auth } from '@angular/fire/auth';
import { Database } from '@angular/fire/database';
import { of } from 'rxjs';
import { Flight } from '../models/flight';

describe('FlightsService', () => {
    let service: FlightsService;
    let airportServiceMock: any;
    let authMock: any;
    let dbMock: any;

    beforeEach(() => {
        airportServiceMock = jasmine.createSpyObj('AirportService', ['loadAirport']);
        authMock = {
            authState: of(null)
        };
        dbMock = {};

        TestBed.configureTestingModule({
            providers: [
                FlightsService,
                { provide: AirportService, useValue: airportServiceMock },
                { provide: Auth, useValue: authMock },
                { provide: Database, useValue: dbMock }
            ]
        });
        service = TestBed.inject(FlightsService);
    });

    describe('calculateHaversineDistance', () => {
        it('should correctly calculate distance between VIE and HAM', () => {
            // VIE: 48.1103, 16.5697
            // HAM: 53.6304, 9.9882
            // Real distance is ~765 km
            const dist = (service as any).calculateHaversineDistance(48.1103, 16.5697, 53.6304, 9.9882);
            expect(dist).toBeCloseTo(765, -1); // Within 10km (Haversine is an approximation)
        });

        it('should return 0 for same point', () => {
            const dist = (service as any).calculateHaversineDistance(48.1103, 16.5697, 48.1103, 16.5697);
            expect(dist).toBe(0);
        });
    });

    describe('isInvalidAnomaly', () => {
        it('should return true for negative duration', () => {
            const flight: Partial<Flight> = { durationMilliseconds: -1000, distance: 500 };
            expect(service.isInvalidAnomaly(flight as Flight)).toBeTrue();
        });

        it('should return true for zero duration', () => {
            const flight: Partial<Flight> = { durationMilliseconds: 0, distance: 500 };
            expect(service.isInvalidAnomaly(flight as Flight)).toBeTrue();
        });

        it('should return true for missing duration', () => {
            const flight: Partial<Flight> = { distance: 500 };
            expect(service.isInvalidAnomaly(flight as Flight)).toBeTrue();
        });

        it('should return true for missing distance', () => {
            const flight: Partial<Flight> = { durationMilliseconds: 3600000 };
            expect(service.isInvalidAnomaly(flight as Flight)).toBeTrue();
        });

        it('should return true for zero distance', () => {
            const flight: Partial<Flight> = { durationMilliseconds: 3600000, distance: 0 };
            expect(service.isInvalidAnomaly(flight as Flight)).toBeTrue();
        });

        it('should return false for valid data', () => {
            const flight: Partial<Flight> = { durationMilliseconds: 3600000, distance: 500 };
            expect(service.isInvalidAnomaly(flight as Flight)).toBeFalse();
        });
    });

    describe('filterInvalidFlights', () => {
        it('should filter out flights with valid data', () => {
            const flights: Partial<Flight>[] = [
                { _id: '1', durationMilliseconds: 3600000, distance: 500 }, // Valid
                { _id: '2', durationMilliseconds: -1, distance: 500 },      // Invalid
                { _id: '3', durationMilliseconds: 3600000, distance: 0 }    // Invalid
            ];
            const result = (service as any).filterInvalidFlights(flights as Flight[]);
            expect(result.length).toBe(2);
            expect(result.map((f: any) => f._id)).toContain('2');
            expect(result.map((f: any) => f._id)).toContain('3');
        });

        it('should filter out validated anomalies', () => {
            const flights: Partial<Flight>[] = [
                { _id: '1', durationMilliseconds: -1, distance: 500, validatedAnomaly: true },
                { _id: '2', durationMilliseconds: -1, distance: 500 }
            ];
            const result = (service as any).filterInvalidFlights(flights as Flight[]);
            expect(result.length).toBe(1);
            expect(result[0]._id).toBe('2');
        });
    });

    describe('recalculateFlightData', () => {
        it('should calculate duration and distance and save the flight', (done) => {
            const flight: Flight = {
                _id: 'f1',
                from: 'VIE',
                to: 'HAM',
                departureTime: '2024-01-01T10:00:00Z',
                arrivalTime: '2024-01-01T12:00:00Z',
                date: '2024-01-01'
            } as Flight;

            airportServiceMock.loadAirport.and.callFake((code: string) => {
                if (code === 'VIE') return of({ latitude: 48.1103, longitude: 16.5697 });
                if (code === 'HAM') return of({ latitude: 53.6304, longitude: 9.9882 });
                return of(null);
            });

            spyOn(service, 'saveFlight').and.returnValue(of({ type: 0, flightId: 'f1' } as any));

            service.recalculateFlightData(flight).subscribe(success => {
                expect(success).toBeTrue();
                expect(flight.durationMilliseconds).toBe(7200000); // 2 hours
                expect(flight.distance).toBeCloseTo(765, -1);
                expect(service.saveFlight).toHaveBeenCalledWith(flight);
                done();
            });
        });
    });
});
