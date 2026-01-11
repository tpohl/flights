import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'logo',
    standalone: true
})
export class LogoPipe implements PipeTransform {
    transform(value: string | undefined | null): string {
        if (!value) return '';

        // Pass the raw value to the media server, let it handle the mapping/normalization
        const encodedValue = encodeURIComponent(value.trim());
        return `https://flights-media.pohl.rocks/media/airline/logo/${encodedValue}`;
    }
}
