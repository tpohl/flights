import { Component, Input, OnInit, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OverallStats } from '../models/stats';
import { ExactDurationPipe } from '../pipes/exactDurationPipe';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';

@Component({
    selector: 'app-flight-summary-card',
    imports: [
        CommonModule,
        MatCardModule,
        MatIconModule,
        MatListModule,
        MatDividerModule,
        ExactDurationPipe
    ],
    templateUrl: './flight-summary-card.component.html',
    styleUrls: ['./flight-summary-card.component.scss']
})
export class FlightSummaryCardComponent {
    @Input() stats: OverallStats | null = null;
    @Input() compact: boolean = false;
}
