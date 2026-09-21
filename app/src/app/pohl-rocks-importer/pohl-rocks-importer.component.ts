import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { finalize, forkJoin, map, of, take } from 'rxjs';
import { Airport } from '../models/airport';
import { AirportService } from '../services/airport.service';
import { FlightsService } from '../services/flights.service';
import {
  extractAirportIata, ImportPreview, parseCsv, previewMyFlightradar24Import
} from '../services/myflightradar24';

@Component({
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatDividerModule
  ],
  selector: 'app-pohl-rocks-importer',
  templateUrl: './pohl-rocks-importer.component.html',
  styleUrls: ['./pohl-rocks-importer.component.scss']
})
export class PohlRocksImporterComponent {
  csvText = signal('');
  preview = signal<ImportPreview | null>(null);
  error = signal('');
  result = signal('');
  parsing = signal(false);
  importing = signal(false);

  private airportService = inject(AirportService);
  private flightsService = inject(FlightsService);

  fileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.clearPreview();
    this.parsing.set(true);
    const reader = new FileReader();
    reader.onload = () => {
      this.csvText.set(String(reader.result || ''));
      this.parseFlights();
    };
    reader.onerror = () => {
      this.error.set('The CSV file could not be read.');
      this.parsing.set(false);
    };
    reader.readAsText(file);
  }

  clearPreview(): void {
    this.preview.set(null);
    this.error.set('');
    this.result.set('');
  }

  parseFlights(): void {
    this.clearPreview();
    this.parsing.set(true);
    let table;
    try {
      table = parseCsv(this.csvText());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The CSV could not be parsed.');
      this.parsing.set(false);
      return;
    }
    const fromIndex = table.headers.indexOf('From');
    const toIndex = table.headers.indexOf('To');
    const codes: string[] = [...new Set<string>(table.rows.flatMap(row => [
      extractAirportIata(row.values[fromIndex]), extractAirportIata(row.values[toIndex])
    ]).filter((code): code is string => !!code))];
    const airports$ = codes.length ? forkJoin(codes.map(code =>
      this.airportService.loadAirport(code).pipe(take(1), map(airport => [code, airport] as const))
    )) : of([]);

    airports$.pipe(finalize(() => this.parsing.set(false))).subscribe({
      next: entries => {
        const airportEntries = entries as readonly (readonly [string, Airport | null])[];
        const airports = new Map(airportEntries.filter((entry): entry is readonly [string, Airport] => !!entry[1]));
        try {
          this.preview.set(previewMyFlightradar24Import(
            this.csvText(), airports, this.flightsService.allFlightsIncludingInvalidAndDeleted()
          ));
        } catch (error) {
          this.error.set(error instanceof Error ? error.message : 'The CSV could not be converted.');
        }
      },
      error: () => this.error.set('Airport data could not be loaded. Try again before importing.')
    });
  }

  importFlights(): void {
    if (this.importing()) return;
    const flights = this.preview()?.rows
      .filter(row => row.status === 'ready' && row.flight)
      .map(row => row.flight!) || [];
    if (!flights.length) return;
    this.importing.set(true);
    this.error.set('');
    this.result.set('');
    this.flightsService.bulkImportMyFlightradar24(flights)
      .pipe(finalize(() => this.importing.set(false)))
      .subscribe({
        next: result => {
          this.result.set(`Imported ${result.imported} flight${result.imported === 1 ? '' : 's'}.` +
            (result.skipped ? ` ${result.skipped} already existed and were skipped.` : ''));
          const current = this.preview();
          if (current && result.imported) {
            this.preview.set({
              rows: current.rows.map(row => row.status === 'ready' ? { ...row, status: 'duplicate' } : row),
              summary: {
                ...current.summary, ready: 0,
                duplicate: current.summary.duplicate + current.summary.ready
              }
            });
          }
        },
        error: error => this.error.set(error instanceof Error ? error.message : 'The import failed.')
      });
  }
}
