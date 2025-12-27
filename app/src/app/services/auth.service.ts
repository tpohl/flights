import { Injectable, inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState, signInWithPopup, User, GoogleAuthProvider, signOut } from '@angular/fire/auth';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private auth = inject(Auth);

    user: Signal<User | null> = toSignal(authState(this.auth), { initialValue: null });
    authState$ = authState(this.auth);

    constructor() { }

    login() {
        return signInWithPopup(this.auth, new GoogleAuthProvider());
    }

    logout() {
        return signOut(this.auth);
    }
}
