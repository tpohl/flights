import { bufferTime, debounceTime, filter, groupBy, map, mergeMap, shareReplay, take, tap, toArray } from 'rxjs/operators';
import { Airport } from './models/airport';
import { AirportService } from './services/airport.service';
import { Flight } from './models/flight';
import { AeroAPITrackResponse, Position } from './models/aeroapi';
import { Component, ElementRef, OnDestroy, OnInit, ChangeDetectionStrategy, input, effect, inject } from '@angular/core';
import { BehaviorSubject, combineLatest, from, Observable, of, Subscription, zip } from 'rxjs';

import { interpolateRainbow } from 'd3-scale-chromatic';
import * as Cesium from 'cesium';
import { FlightsService } from './services/flights.service';
import { Environment } from '../environments/environment';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cesium',
  template: '<div></div>',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CesiumDirective implements OnInit, OnDestroy {
  private element = inject(ElementRef);
  private airportService = inject(AirportService);
  private flightService = inject(FlightsService);

  flights = input<Flight[] | null>(null);
  timelineMode = input(true);
  showCountries = input(true);

  private flights$ = new BehaviorSubject<Flight[]>([]);
  private routeEntities = new Array<Cesium.Entity>();

  private maxLongitude = -400.0;
  private minLongitude = 400.0;
  private maxLatitude = -400.0;
  private minLatitude = 400.0;
  private viewer: any;

  private countryDataSource!: Cesium.GeoJsonDataSource;
  private subs = new Subscription();

  constructor() {
    Cesium.Ion.defaultAccessToken = Environment.cesium.accessToken;

    effect(() => {
      const fls = this.flights();
      if (fls) {
        this.flights$.next(fls);
      }
    });

    effect(() => {
      const show = this.showCountries();
      if (this.viewer && this.countryDataSource) {
        if (show) {
          this.viewer.dataSources.add(this.countryDataSource);
        } else {
          this.viewer.dataSources.remove(this.countryDataSource);
        }
      }
    });
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    if (this.viewer) {
      this.viewer.destroy();
    }
  }

  ngOnInit() {
    this.viewer = new Cesium.Viewer(this.element.nativeElement, {
      sceneMode: this.timelineMode() ? Cesium.SceneMode.SCENE3D : Cesium.SceneMode.COLUMBUS_VIEW,
      animation: this.timelineMode(),
      timeline: this.timelineMode()
    });

    const geoJSON$ = from(Cesium.GeoJsonDataSource.load('/assets/world-atlas/countries-110m.json', {
      stroke: Cesium.Color.LIGHTBLUE.withAlpha(0.5),
      fill: Cesium.Color.BLUE.withAlpha(0.1),
      strokeWidth: 3
    })).pipe(take(1), shareReplay(1));

    this.subs.add(
      combineLatest([
        geoJSON$,
        this.flights$.pipe(
          filter(flights => flights.length > 0),
          take(1),
          mergeMap(flights =>
            from(flights).pipe(
              mergeMap(flight => this.airportService.loadAirport(flight.to)),
              map(airport => airport?.country),
              filter(country => !!country),
              bufferTime(1000),
            )
          ),
          filter(countries => countries.length > 0),
          map(countriesVisited => countriesVisited.reduce((acc, country) => {
            const count = acc.get(country!.isoNo) || 0;
            acc.set(country!.isoNo, count + 1);
            return acc;
          }, new Map<string, number>())
          ))
      ]).subscribe(([countries, countriesVisited]) => {
        const data = countries;

        if (countriesVisited.size > 0) {
          for (let i = 0; i < data.entities.values.length; i++) {
            const entity = data.entities.values[i];
            if (Cesium.defined(entity.polygon)) {
              entity.polygon.arcType = new Cesium.ConstantProperty(Cesium.ArcType.GEODESIC);
            }

            const isoCountryCode = entity.id.substring(0, 3);
            if (!entity.id || countriesVisited.get(isoCountryCode) === undefined) {
              entity.show = false;
            } else {
              const visits = (countriesVisited.get(isoCountryCode) || 0);
              if (Cesium.defined(entity.polygon)) {
                entity.polygon!.extrudedHeight = new Cesium.ConstantProperty(Math.min(10000 * visits, 200000));
              }
            }
          }

          this.countryDataSource = data;
          if (this.showCountries()) {
            this.viewer.dataSources.add(data);
          }
        }
      }));

    const colorFunction = interpolateRainbow;
    this.subs.add(this.flights$
      .pipe(
        debounceTime(100),
        mergeMap(flightArray => {
          this.routeEntities.forEach((entity) => {
            this.viewer.entities.remove(entity);
          });
          this.routeEntities = [];
          let totalFlights = 0;
          let flightNumber = 0;
          const many = flightArray.length > 10;
          return from(flightArray)
            .pipe(
              filter(_flight => !!_flight.from && !!_flight.to),
              groupBy(flight => flight.from + flight.to),
              mergeMap(group => group.pipe(toArray())),
              map(_flightArray => _flightArray[0]),
              tap(() => {
                totalFlights = totalFlights + 1;
              })
            )
            .pipe(mergeMap(flight =>
              zip([
                this.airportService.loadAirport(flight.from),
                this.airportService.loadAirport(flight.to),
                many ? of(undefined) : this.flightService.loadFlightTrack(flight)
              ]).pipe(
                map(([fromAp, toAp, flightTrack]) => {
                  if (fromAp && toAp) {
                    this.maxLatitude = Math.max(this.maxLatitude, fromAp.latitude, toAp.latitude);
                    this.maxLongitude = Math.max(this.maxLongitude, fromAp.longitude, toAp.longitude);
                    this.minLatitude = Math.min(this.minLatitude, fromAp.latitude, toAp.latitude);
                    this.minLongitude = Math.min(this.minLongitude, fromAp.longitude, toAp.longitude);

                    const f = new CesiumFlight();
                    f.departureTime = new Date(flight.departureTime);
                    f.arrivalTime = new Date(flight.arrivalTime);
                    f.fromAp = fromAp;
                    f.toAp = toAp;
                    if (!!flightTrack) {
                      f.positions = (flightTrack as AeroAPITrackResponse).positions;
                    }
                    return f;
                  }
                  return null;
                })
              )),
              filter((f): f is CesiumFlight => !!f && !!f.fromAp && !!f.toAp),
              tap(flight => {
                const color = colorFunction(flightNumber++ / totalFlights);
                this.routeEntities.push(this.drawFlight(flight, color));
              })
            );
        }),
        debounceTime(300)
      )
      .subscribe(() => {
        const west = this.minLongitude - 5.0;
        const south = this.minLatitude - 5.0;
        const east = this.maxLongitude + 5.0;
        const north = this.maxLatitude + 5.0;
        const rectangle = this.viewer.entities.add({
          rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
            show: true,
            material: new Cesium.Color(0.0, 0.0, 0.0, 0.0)
          }
        });
        this.viewer.flyTo(rectangle);
      }));
  }

  drawFlight(route: CesiumFlight, colorString?: string) {
    const color = Cesium.Color.fromCssColorString(colorString ? colorString : '#FFB300');
    const departure = this.timelineMode() ? new Date(route.departureTime) : new Date(Date.now() - 600000);
    const arrival = this.timelineMode() ? new Date(route.arrivalTime) : new Date(Date.now() - 100000);

    const startTime = Cesium.JulianDate.fromDate(departure, new Cesium.JulianDate());
    let stopTime = Cesium.JulianDate.fromDate(arrival, new Cesium.JulianDate());

    const durationSeconds = Math.min(55, Cesium.JulianDate.secondsDifference(startTime, stopTime));
    const midTime = Cesium.JulianDate.addSeconds(startTime, (durationSeconds / 2.0), new Cesium.JulianDate());
    stopTime = Cesium.JulianDate.addSeconds(startTime, durationSeconds, new Cesium.JulianDate());

    let property = new Cesium.SampledPositionProperty();

    if (!!route.positions && route.positions.length > 2) {
      route.positions.forEach(position => {
        property.addSample(Cesium.JulianDate.fromIso8601(position.timestamp, new Cesium.JulianDate()), Cesium.Cartesian3.fromDegrees(position.longitude, position.latitude, position.altitude * 300));
      });
    } else {
      const stopPosition = Cesium.Cartesian3.fromDegrees(route.fromAp.longitude, route.fromAp.latitude, 0);
      const startPosition = Cesium.Cartesian3.fromDegrees(route.toAp.longitude, route.toAp.latitude, 0);

      property.addSample(startTime, startPosition);
      property.addSample(stopTime, stopPosition);

      const distance = Cesium.Cartesian3.distance(startPosition, stopPosition);
      const midPositionVal = property.getValue(midTime);
      if (midPositionVal) {
        const midPoint = Cesium.Cartographic.fromCartesian(midPositionVal);
        midPoint.height = Cesium.Math.nextRandomNumber() * 100000 + Math.sqrt(distance) * 500;
        const midPosition = this.viewer.scene.globe.ellipsoid.cartographicToCartesian(midPoint, new Cesium.Cartesian3());

        property = new Cesium.SampledPositionProperty();
        property.addSample(startTime, startPosition);
        property.addSample(midTime, midPosition);
        property.addSample(stopTime, stopPosition);
      }
    }

    const arcEntity = this.viewer.entities.add({
      position: property,
      point: {
        pixelSize: 8,
        color: Cesium.Color.TRANSPARENT,
        outlineColor: color,
        outlineWidth: 3
      },
      path: {
        name: route.name,
        resolution: 100,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.16,
          color: color
        }),
        width: 5,
        leadTime: 0,
        trailTime: 1e10
      }
    });

    arcEntity.position.setInterpolationOptions({
      interpolationDegree: 5,
      interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
    });
    return arcEntity;
  }
}

class CesiumFlight {
  departureTime!: Date;
  arrivalTime!: Date;
  fromAp!: Airport;
  toAp!: Airport;
  name!: string;
  positions!: Position[];
}



