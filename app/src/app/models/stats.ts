import { Airport } from './airport';
import { Flight } from './flight';

export class FlightStats {
  flight!: Flight;
  hasAircraft = false;
  aircraft = 'select';
  flightsWithAircraft: Flight[] = [];
  flightsWithType = 0;
  flightsOnRoute = 0;
}

export class OverallStats {
  count = 0;
  distance = 0;
  totalTimeMilliseconds = 0;
  airportsVisited: CountMap = new CountMap();

  longestFlight: Flight | null = null;
  shortestFlight: Flight | null = null;
  fastestFlight: Flight | null = null;
  slowestFlight: Flight | null = null;

  topAirlines: CountedItem[] = [];
  topAircraftTypes: CountedItem[] = [];
  topRegistrations: CountedItem[] = [];
  topAirports: CountedItem[] = [];
  topCountries: CountedItem[] = [];
  topRoutes: CountedItem[] = [];

  distanceByClass: Record<string, number> = {};
  timeByClass: Record<string, number> = {};

  extremeAirports: {
    north: Airport | null;
    south: Airport | null;
    east: Airport | null;
    west: Airport | null;
  } = { north: null, south: null, east: null, west: null };
}

export class CountMap {
  private items: Map<string, CountedItem> = new Map<string, CountedItem>();
  add(name: string) {
    let item = this.items.get(name);
    if (!item) {
      item = new CountedItem();
      item.name = name;
      item.count = 0;
      this.items.set(name, item);
    }
    item.count = item.count + 1;
  }

  getItems(): CountedItem[] {
    return Array.from(this.items.values());
  }

  getTop(n: number): CountedItem[] {
    return this.getItems()
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  size(): number {
    return this.items.size;
  }
}

export class CountedItem {
  name: string = '';
  count: number = 0;
}