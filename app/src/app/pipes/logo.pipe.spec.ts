import { LogoPipe } from './logo.pipe';

describe('LogoPipe', () => {
    let pipe: LogoPipe;

    beforeEach(() => {
        pipe = new LogoPipe();
    });

    it('create an instance', () => {
        expect(pipe).toBeTruthy();
    });

    it('should extract LH from LH2065', () => {
        const result = pipe.transform('LH2065');
        expect(result).toBe('https://flights-media.pohl.rocks/media/airline/logo/LH');
    });

    it('should extract X3 from X35436', () => {
        const result = pipe.transform('X35436');
        expect(result).toBe('https://flights-media.pohl.rocks/media/airline/logo/X3');
    });

    it('should extract DLH from DLH123', () => {
        const result = pipe.transform('DLH123');
        expect(result).toBe('https://flights-media.pohl.rocks/media/airline/logo/DLH');
    });

    it('should handle already truncated code LH', () => {
        const result = pipe.transform('LH');
        expect(result).toBe('https://flights-media.pohl.rocks/media/airline/logo/LH');
    });

    it('should handle already truncated code X3', () => {
        const result = pipe.transform('X3');
        expect(result).toBe('https://flights-media.pohl.rocks/media/airline/logo/X3');
    });

    it('should handle lowercase input', () => {
        const result = pipe.transform('lh2065');
        expect(result).toBe('https://flights-media.pohl.rocks/media/airline/logo/LH');
    });

    it('should handle spaces', () => {
        const result = pipe.transform('  LH2065  ');
        expect(result).toBe('https://flights-media.pohl.rocks/media/airline/logo/LH');
    });

    it('should return empty string for null/undefined', () => {
        expect(pipe.transform(null)).toBe('');
        expect(pipe.transform(undefined)).toBe('');
        expect(pipe.transform('')).toBe('');
    });
});
