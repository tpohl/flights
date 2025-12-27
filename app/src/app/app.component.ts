import { Component, inject } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class AppComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

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
}
