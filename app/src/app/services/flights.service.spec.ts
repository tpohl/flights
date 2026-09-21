import { TestBed } from '@angular/core/testing';
import {
    applyMyFr24ImportTransaction, FlightsService, MYFR24_DATABASE_OPERATIONS
} from './flights.service';
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
    let importDatabaseMock: any;

    beforeEach(() => {
        airportServiceMock = jasmine.createSpyObj('AirportService', ['loadAirport']);
        authMock = {
            authState: of(null)
        };
        dbMock = {};
        importDatabaseMock = {
            ref: jasmine.createSpy('ref').and.callFake((_db: any, path: string) => ({ path })),
            push: jasmine.createSpy('push').and.returnValue({ key: 'new-1' }),
            runTransaction: jasmine.createSpy('runTransaction')
        };

        TestBed.configureTestingModule({
            providers: [
                FlightsService,
                { provide: AirportService, useValue: airportServiceMock },
                { provide: Auth, useValue: authMock },
                { provide: Database, useValue: dbMock },
                { provide: MYFR24_DATABASE_OPERATIONS, useValue: importDatabaseMock }
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

        describe('myFlightradar24 atomic import transaction', () => {
            const importedFlight = {
                date: '2024-01-10', flightno: 'LH123', from: 'BER', to: 'LHR',
                departureTime: '2024-01-10T09:00:00.000Z',
                importMetadata: {
                    source: 'myflightradar24', sourceKey: 'source-1',
                    importedAt: '2026-09-11T12:00:00.000Z'
                }
            } as Flight;

            it('writes the flight and idempotency marker in one user-node update', () => {
                const result = applyMyFr24ImportTransaction({}, [{ flight: importedFlight, key: 'new-1' }], 'user-1');
                expect(result.flights['new-1']._id).toBe('new-1');
                expect(result.flights['new-1'].needsAutocomplete).toBeFalse();
                expect(result.flights['new-1'].importMetadata.suppressInitialEnrichment).toBeTrue();
                expect(result.imports.myflightradar24['source-1'].flightId).toBe('new-1');
            });

            it('does not write again when the source key is already claimed', () => {
                const current = {
                    imports: { myflightradar24: { 'source-1': { flightId: 'old' } } },
                    flights: { old: { ...importedFlight, _id: 'old' } }
                };
                expect(applyMyFr24ImportTransaction(current, [{ flight: importedFlight, key: 'new-1' }], 'user-1'))
                    .toBeUndefined();
            });

            it('rechecks active-flight duplicates but ignores deleted records', () => {
                const duplicate = { ...importedFlight, _id: 'old', importMetadata: undefined };
                expect(applyMyFr24ImportTransaction(
                    { flights: { old: duplicate } }, [{ flight: importedFlight, key: 'new-1' }], 'user-1'
                )).toBeUndefined();
                const result = applyMyFr24ImportTransaction(
                    { flights: { old: { ...duplicate, _deleted: true } } },
                    [{ flight: importedFlight, key: 'new-1' }], 'user-1'
                );
                expect(result.flights['new-1']).toBeDefined();
            });

            it('uses one mocked Firebase user-node transaction and is idempotent on retry', (done) => {
                (service as any).user = { uid: 'user-1' };
                let serverValue: any = {};
                importDatabaseMock.runTransaction.and.callFake((_ref: any, update: (value: any) => any) => {
                    const next = update(serverValue);
                    if (next === undefined) return Promise.resolve({
                        committed: false, snapshot: { val: () => serverValue }
                    });
                    serverValue = next;
                    return Promise.resolve({ committed: true, snapshot: { val: () => serverValue } });
                });

                service.bulkImportMyFlightradar24([importedFlight]).subscribe(first => {
                    expect(first.imported).toBe(1);
                    service.bulkImportMyFlightradar24([importedFlight]).subscribe(second => {
                        expect(second).toEqual({ imported: 0, skipped: 1, flightIds: [] });
                        expect(importDatabaseMock.runTransaction).toHaveBeenCalledTimes(2);
                        expect(importDatabaseMock.runTransaction.calls.allArgs().every(
                            (args: any[]) => args[0].path === 'users/user-1'
                        )).toBeTrue();
                        done();
                    });
                });
            });
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
                { _id: '1', departureTime: '2024-01-01T10:00:00Z', durationMilliseconds: 3600000, distance: 500 }, // Valid
                { _id: '2', departureTime: '2024-01-01T10:00:00Z', durationMilliseconds: -1, distance: 500 },      // Invalid
                { _id: '3', departureTime: '2024-01-01T10:00:00Z', durationMilliseconds: 3600000, distance: 0 }    // Invalid
            ];
            const result = (service as any).filterInvalidFlights(flights as Flight[]);
            expect(result.length).toBe(2);
            expect(result.map((f: any) => f._id)).toContain('2');
            expect(result.map((f: any) => f._id)).toContain('3');
        });

        it('should filter out validated anomalies', () => {
            const flights: Partial<Flight>[] = [
                { _id: '1', departureTime: '2024-01-01T10:00:00Z', durationMilliseconds: -1, distance: 500, validatedAnomaly: true },
                { _id: '2', departureTime: '2024-01-01T10:00:00Z', durationMilliseconds: -1, distance: 500 }
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
                expect(service.saveFlight).toHaveBeenCalledWith(flight, {
                    durationMilliseconds: 7200000,
                    distance: flight.distance
                }, {
                    flightno: undefined, date: '2024-01-01', from: 'VIE', to: 'HAM',
                    departureTime: '2024-01-01T10:00:00Z', arrivalTime: '2024-01-01T12:00:00Z'
                });
                done();
            });
        });
    });
});
