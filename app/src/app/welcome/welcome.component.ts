import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-welcome',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './welcome.component.html',
    styleUrls: ['./welcome.component.css']
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
