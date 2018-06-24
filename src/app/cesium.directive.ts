import { Airport } from './models/airport';
import { AirportService } from './services/airport.service';
import { Flight } from './models/flight';
import { Directive, OnInit, ElementRef, Input, Component } from '@angular/core';
import { Observable, from, zip, of } from 'rxjs';
import { delay, scan, reduce, mergeMap, last, flatMap, tap, map, sample, debounceTime } from 'rxjs/operators';

import { interpolateRainbow } from 'd3-scale-chromatic';



@Component({
  selector: 'app-cesium',
  template: '<div></div>'
})
export class CesiumDirective implements OnInit {
  @Input()
  private flights: Observable<Array<Flight>>;

  constructor(private element: ElementRef, private airportService: AirportService) {
    Cesium.BingMapsApi.defaultKey = 'Arvxz11onv0TmhTvn0mMzbRDEVJ59LI35MI6YScmvQS3jzwzORkEZAv1Xs987i0T';
  }

  private viewer: any;
  ngOnInit() {
    // Put initialization code for the Cesium viewer here
    this.viewer = new Cesium.Viewer(this.element.nativeElement, {
      animation: false,
      timeline: false
    });
    this.flights
      .pipe(delay(1))
      .subscribe(flightArray => {
        from(flightArray)
          .pipe(mergeMap(flight =>
            zip(
              this.airportService.loadAirport(flight.from),
              this.airportService.loadAirport(flight.to),
              (fromAp: Airport, to: Airport) => ({ fromAp, to }))
          )
          )
          //        .pipe(tap(console.log))
          .pipe(map(airports => {
            const route = new Route();
            route.name = [airports.fromAp.code, airports.to.code].sort().join();
            route.
              positions= Cesium.Cartesian3.fromDegreesArray([
                airports.fromAp.longitude, airports.fromAp.latitude,
                airports.to.longitude, airports.to.latitude]);
              route.count= 0

            return route;
          }))
          .pipe(scan(
            (acc, value: Route) => {
              let route = acc.get(value.name);
              if (!route) {
                route = value;
                acc.set(route.name, route);
              }
              route.count++;

              return acc;
            }, new Map<String, Route>()))
            .pipe(debounceTime(10))
            .subscribe(routes => {
              const total = routes.size;
              let i = 0;
              const colorFunction = interpolateRainbow;
              routes.forEach(route => {
               // console.log('Adding Route ', route.name);
                const color = colorFunction(i++ / total);
                this.viewer.entities.add({
                  polyline: {
                    name: route.name,
                    positions: route.positions,
                    width: Math.min(10, route.count),
                    material: Cesium.Color.fromCssColorString(color)
                  }

                });
                this.viewer.zoomTo(this.viewer.entities);
              });
            });
      });


  }

}

class Route {
  name: string;
  count: number;
  positions: any;
}
