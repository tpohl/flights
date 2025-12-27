import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { map, take, tap } from 'rxjs/operators';

export const publicGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.authState$.pipe(
        take(1),
        map(user => !user), // Return true if NO user (public allowed)
        tap(isPublic => {
            if (!isPublic) {
                console.log('Already logged in, redirecting to flights');
                router.navigate(['/flights']);
            }
        })
    );
};
