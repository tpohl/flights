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

  size(): number {
    return this.items.size;
  }
}

export class CountedItem {
  name: string = '';
  count: number = 0;
}