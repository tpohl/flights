import { Component, inject, signal } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';

// Angular Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    imports: [
        CommonModule,
        RouterModule,
        MatToolbarModule,
        MatSidenavModule,
        MatButtonModule,
        MatIconModule,
        MatListModule
    ]
})
export class AppComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  sidenavOpen = signal(false);

  constructor() {
  }

  login() {
    this.authService.login();
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/welcome']);
  }

  isLoggedIn() {
    return !!this.authService.user();
  }

  toggleSidenav() {
    this.sidenavOpen.update(v => !v);
  }

  closeSidenav() {
    this.sidenavOpen.set(false);
  }
}
