import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'logo',
    standalone: true
})
export class LogoPipe implements PipeTransform {
    transform(value: string | undefined | null): string {
        if (!value) return '';

        let code = value.trim().toUpperCase();

        // Extract airline code from flight number
        // Try 3-letter ICAO first, then 2-character IATA (can be letter-digit)
        const icaoMatch = code.match(/^([A-Z]{3})\d+/);
        if (icaoMatch) {
            code = icaoMatch[1];
        } else {
            const iataMatch = code.match(/^([A-Z0-9]{2})\d+/);
            if (iataMatch) {
                code = iataMatch[1];
            }
        }

        const encodedValue = encodeURIComponent(code);
        return `https://flights-media.pohl.rocks/media/airline/logo/${encodedValue}`;
    }
}
