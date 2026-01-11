import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatRippleModule } from '@angular/material/core';
import { Flight } from '../models/flight';

@Component({
    selector: 'app-flight-card',
    standalone: true,
    imports: [CommonModule, RouterModule, MatCardModule, MatRippleModule],
    templateUrl: './flight-card.component.html',
    styleUrls: ['./flight-card.component.scss']
})
export class FlightCardComponent {
    flight = input.required<Flight>();
    validated = input(false);
}
