import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Angular Material
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

@Component({
    selector: 'app-welcome',
    imports: [CommonModule, MatButtonModule, MatIconModule, MatCardModule],
    templateUrl: './welcome.component.html',
    styleUrls: ['./welcome.component.scss']
})
export class WelcomeComponent {
    private authService = inject(AuthService);
    private router = inject(Router);

    async login() {
        try {
            await this.authService.login();
            await this.router.navigate(['/flights']);
        } catch (err) {
            console.error('Login failed', err);
        }
    }
}
