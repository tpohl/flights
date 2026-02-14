import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';

import dayjs from 'dayjs';
import { TripsService } from '../services/trips.service';
import { FlightsService } from '../services/flights.service';
import { Trip } from '../models/trip';
import { Flight } from '../models/flight';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-trip-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCardModule
  ],
  templateUrl: './trip-wizard.component.html',
  styleUrls: ['./trip-wizard.component.css']
})
export class TripWizardComponent {
  private fb = inject(FormBuilder);
  private tripsService = inject(TripsService);
  private flightsService = inject(FlightsService);
  private router = inject(Router);

  tripForm: FormGroup;
  isSaving = signal(false);

  constructor() {
    this.tripForm = this.fb.group({
      name: ['', Validators.required],
      segments: this.fb.array([this.createSegment()])
    });

    this.tripForm.get('segments')?.valueChanges.subscribe(segments => {
      if (segments && segments.length > 0) {
        const flights = segments.map((s: any) => {
          const f = new Flight();
          f.flightno = s.flightNo;
          f.date = s.date;
          // We don't have 'to' airport easily here without loading flight details.
          // But we can try to guess or just leave it for now.
          // Actually, without 'to' airport, naming service can't do much.
          // The wizard only asks for Flight No and Date.
          // So auto-naming is hard without fetching flight details first.
          return f;
        });
        // Skip auto-naming for now as we lack data in the wizard form.
      }
    });
  }

  get segments(): FormArray {
    return this.tripForm.get('segments') as FormArray;
  }

  createSegment(defaultDate: Date = new Date()): FormGroup {
    return this.fb.group({
      flightNo: ['', Validators.required],
      date: [defaultDate, Validators.required]
    });
  }

  addSegment() {
    const segmentsArray = this.segments;
    let nextDate = new Date(); // Default to today if no segments

    if (segmentsArray.length > 0) {
      const lastSegmentValue = segmentsArray.at(segmentsArray.length - 1).value;
      if (lastSegmentValue.date) {
        // Clone the date to avoid reference issues
        nextDate = new Date(lastSegmentValue.date);
      }
    }

    this.segments.push(this.createSegment(nextDate));
  }

  removeSegment(index: number) {
    this.segments.removeAt(index);
  }

  async createTrip() {
    if (this.tripForm.invalid) return;

    this.isSaving.set(true);
    const formValue = this.tripForm.value;

    const newTrip = new Trip();
    newTrip.name = formValue.name;

    // Save Trip first to get ID
    try {
      const tripId = await firstValueFrom(this.tripsService.saveTrip(newTrip));

      if (!tripId) {
        console.error('Failed to create trip');
        this.isSaving.set(false);
        return;
      }

      console.log('Creating trip with segments:', formValue.segments);

      // Create Flights
      const flightPromises = formValue.segments.map((segment: any, index: number) => {
        const f = new Flight();
        f.flightno = segment.flightNo.toUpperCase(); // Ensure uppercase
        f.date = dayjs(segment.date).format('YYYY-MM-DD');
        // Set departureTime to start of day to ensure it appears in the list
        // Backend autocomplete will update this later
        f.departureTime = dayjs(segment.date).startOf('day').toISOString();
        f.tripId = tripId;
        f.needsAutocomplete = true;
        f.created = new Date();

        console.log(`Saving flight ${index + 1}/${formValue.segments.length}:`, f);
        return firstValueFrom(this.flightsService.saveFlight(f))
          .then(res => {
            console.log(`Flight ${index + 1} saved:`, res);
            return res;
          })
          .catch(err => {
            console.error(`Flight ${index + 1} failed:`, err);
            throw err;
          });
      });

      await Promise.all(flightPromises);
      console.log('All flights saved.');

      // Navigate to flight list or trip view
      this.router.navigate(['/flights']);
    } catch (error) {
      console.error('Error creating trip:', error);
      this.isSaving.set(false);
      // Ideally show a snackbar or alert here
      alert('Failed to create trip. Please try again.');
    }
  }

  cancel() {
    this.router.navigate(['/flights']);
  }
}
