import { Component, inject, Injector, runInInjectionContext } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth, authState } from '@angular/fire/auth';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class AppComponent {
  private auth = inject(Auth);
  private router = inject(Router);
  private injector = inject(Injector);
  user: Observable<any> = runInInjectionContext(this.injector, () => authState(this.auth));
  userDetails: any = null;

  constructor() {
    this.user.subscribe((user) => this.userDetails = user || null);
  }

  login() {
    // migrate login to modular SDK if needed
    console.warn('Login not implemented for modular SDK here.');
  }

  logout() {
    this.auth.signOut().then(() => this.router.navigate(['/']));
  }

  isLoggedIn() {
    return !!this.userDetails;
  }
}
