import { Component, inject, signal, computed } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';

// Angular Material
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

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
    MatListModule,
    MatDividerModule,
    MatTooltipModule
  ]
})
export class AppComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  sidenavOpen = signal(false);
  isLoggedIn = computed(() => !!this.authService.user());

  login() {
    this.authService.login();
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/welcome']);
  }

  toggleSidenav() {
    this.sidenavOpen.update(v => !v);
  }

  closeSidenav() {
    this.sidenavOpen.set(false);
  }
}
