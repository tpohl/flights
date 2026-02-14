import { Injectable, inject, Injector, runInInjectionContext, Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, firstValueFrom, from, Observable, of } from 'rxjs';
import { filter, map, switchMap, take } from 'rxjs/operators';
import { Database, ref, set, push, remove } from '@angular/fire/database';
import { Auth, authState, User } from '@angular/fire/auth';
import { listVal, objectVal } from 'rxfire/database';

import { Trip } from '../models/trip';
import { FlightsService } from './flights.service';

@Injectable({
  providedIn: 'root'
})
export class TripsService {

  private tripsSubject = new BehaviorSubject<Trip[]>([]);

  trips: Signal<Trip[]> = toSignal(this.tripsSubject, { initialValue: [] });

  private auth = inject(Auth);
  private db = inject(Database);
  private injector = inject(Injector);
  private flightsService = inject(FlightsService); // Inject FlightsService
  private user: User | null = null;

  constructor() {
    authState(this.auth).pipe(
      filter((user): user is User => user !== null),
      take(1)
    ).subscribe(user => {
      this.user = user;
      this.init();
    });
  }

  private init() {
    runInInjectionContext(this.injector, () => of(this.user).pipe(
      filter(user => !!user),
      switchMap(user => {
        const tripsRef = ref(this.db, `users/${user!.uid}/trips`);
        return listVal<Trip>(tripsRef, { keyField: '_id' });
      })
    ).subscribe(trips => {
      // Sort trips if needed, e.g., by name or creation date? 
      // For now, let's sort alphabetically by name
      const sortedTrips = trips.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.tripsSubject.next(sortedTrips);
    }));
  }

  loadTrip(tripId: string): Observable<Trip | null> {
    return authState(this.auth).pipe(
      filter((user): user is User => user !== null),
      take(1),
      switchMap(user => {
        const objectRef = `users/${user.uid}/trips/${tripId}`;
        const tripRef = ref(this.db, objectRef);
        return objectVal<Trip>(tripRef).pipe(
          map(trip => trip ? ({ ...trip, _id: tripId, _objectReference: objectRef }) : null)
        );
      })
    );
  }

  saveTrip(trip: Trip): Observable<string | null> {
    const user = this.user;
    if (!user) return of(null);

    // Ensure flightIds is initialized
    if (!trip.flightIds) {
      trip.flightIds = [];
    }

    return runInInjectionContext(this.injector, () => {
      if (trip._id && trip._objectReference) {
        const tripRef = ref(this.db, trip._objectReference);
        return from(set(tripRef, trip)).pipe(map(() => trip._id));
      } else {
        const newTripRef = push(ref(this.db, `users/${user.uid}/trips`));
        const newTrip = { ...trip, _id: newTripRef.key! };
        // Don't save _id and _objectReference to DB directly usually, but logic above handles it via keyField/objectVal
        // Actually push returns a reference. We should just set the content.
        // Let's Clean the object before saving to avoid circular refs or strictly local fields (like _id in some cases if not handled)
        // But here we just save what we have, excluding _id if we want clean DB.
        // However, existing service uses `_id` quite liberally. 

        // Let's use a clean object for saving
        const tripToSave = { ...trip };
        delete (tripToSave as any)._id;
        delete (tripToSave as any)._objectReference;

        // Ensure userId is set
        tripToSave.userId = user.uid;

        return from(set(newTripRef, tripToSave)).pipe(map(() => newTripRef.key));
      }
    });
  }

  deleteTrip(tripId: string): Observable<boolean> {
    const user = this.user;
    if (!user) return of(false);

    const tripRef = ref(this.db, `users/${user.uid}/trips/${tripId}`);
    return from(remove(tripRef)).pipe(map(() => true));
  }

  async updateTripName(trip: Trip, newName: string): Promise<boolean> {
    const trimmedName = newName.trim();
    if (!trimmedName || trimmedName === trip.name) {
      return false; // No change
    }

    const allTrips = this.tripsSubject.value;
    const existingTrip = allTrips.find(t => t.name.toLowerCase() === trimmedName.toLowerCase() && t._id !== trip._id);

    if (existingTrip) {
      // Merge needed
      return this.mergeTrips(trip, existingTrip);
    } else {
      // Simple rename
      trip.name = trimmedName;
      await firstValueFrom(this.saveTrip(trip));
      return true;
    }
  }

  /*
   * Merges sourceTrip into targetTrip.
   * 1. Finds all flights belonging to sourceTrip.
   * 2. Updates them to belong to targetTrip.
   * 3. Deletes sourceTrip.
   */
  async mergeTrips(sourceTrip: Trip, targetTrip: Trip): Promise<boolean> {
    const allFlights = this.flightsService.allFlightsIncludingInvalidAndDeleted();
    const sourceFlights = allFlights.filter(f => f.tripId === sourceTrip._id);

    const updatePromises = sourceFlights.map(f => {
      f.tripId = targetTrip._id;
      return firstValueFrom(this.flightsService.saveFlight(f));
    });

    await Promise.all(updatePromises);
    await firstValueFrom(this.deleteTrip(sourceTrip._id));
    return true;
  }
}
