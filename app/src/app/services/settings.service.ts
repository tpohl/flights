import { Injectable, inject, Injector, runInInjectionContext, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, from, Observable, of } from 'rxjs';
import { filter, map, switchMap, take } from 'rxjs/operators';
import { Database, ref, set, objectVal } from '@angular/fire/database';
import { Auth, authState, User } from '@angular/fire/auth';

export interface Settings {
  homeAirport: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {

  private settingsSubject = new BehaviorSubject<Settings>({ homeAirport: 'HAM' });

  settings: Signal<Settings> = toSignal(this.settingsSubject, { initialValue: { homeAirport: 'HAM' } });

  private auth = inject(Auth);
  private db = inject(Database);
  private injector = inject(Injector);
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
        const settingsRef = ref(this.db, `users/${user!.uid}/settings`);
        return objectVal<Settings>(settingsRef);
      })
    ).subscribe(settings => {
      if (settings) {
        this.settingsSubject.next({ ...this.settingsSubject.value, ...settings });
      }
    }));
  }

  updateHomeAirport(code: string): Observable<boolean> {
    const user = this.user;
    if (!user) return of(false);

    // Uppercase
    const homeAirport = code.toUpperCase();

    // Optimistic update
    const current = this.settingsSubject.value;
    this.settingsSubject.next({ ...current, homeAirport });

    return runInInjectionContext(this.injector, () => {
      const settingsRef = ref(this.db, `users/${user.uid}/settings`);
      // We only update homeAirport for now, preserving other potential future settings
      // actually we can just set the whole object or partial update
      // set() overwrites the node. update() updates fields.
      // Let's use set for simplicity as we have the full object in state, 
      // but to be safe against concurrent edits of other fields (if any exist later), 
      // we might want to use update. But here `settings` is just one object.
      // Let's just save the current state.
      const newSettings = { ...current, homeAirport };
      return from(set(settingsRef, newSettings)).pipe(map(() => true));
    });
  }
}
