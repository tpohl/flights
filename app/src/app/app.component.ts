import { Component, inject, Injector, runInInjectionContext } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth, authState, GoogleAuthProvider, signInWithPopup } from '@angular/fire/auth';
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

  async login() {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(this.auth, provider);
      await this.router.navigate(['/flights']);
    } catch (error) {
      console.error('Error during login:', error);
    }
  }

  logout() {
    this.auth.signOut().then(() => this.router.navigate(['/']));
  }

  isLoggedIn() {
    return !!this.userDetails;
  }
}
