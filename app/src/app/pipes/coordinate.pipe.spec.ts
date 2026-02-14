import { CoordinatePipe } from './coordinate.pipe';

describe('CoordinatePipe', () => {
  let pipe: CoordinatePipe;

  beforeEach(() => {
    pipe = new CoordinatePipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  describe('latitude formatting', () => {
    it('should format positive latitude with N direction', () => {
      expect(pipe.transform(52.5200, 'latitude')).toBe('52.52°N');
    });

    it('should format negative latitude with S direction', () => {
      expect(pipe.transform(-33.8688, 'latitude')).toBe('33.87°S');
    });

    it('should format zero latitude with N direction', () => {
      expect(pipe.transform(0, 'latitude')).toBe('0.00°N');
    });
  });

  describe('longitude formatting', () => {
    it('should format positive longitude with E direction', () => {
      expect(pipe.transform(13.4050, 'longitude')).toBe('13.41°E');
    });

    it('should format negative longitude with W direction', () => {
      expect(pipe.transform(-122.4194, 'longitude')).toBe('122.42°W');
    });

    it('should format zero longitude with E direction', () => {
      expect(pipe.transform(0, 'longitude')).toBe('0.00°E');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for null value', () => {
      expect(pipe.transform(null, 'latitude')).toBe('');
    });

    it('should return empty string for undefined value', () => {
      expect(pipe.transform(undefined, 'latitude')).toBe('');
    });
  });
});
