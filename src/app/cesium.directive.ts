import { filter, groupBy, toArray, delay, scan, reduce, mergeMap, last, flatMap, tap, map, sample, debounceTime } from 'rxjs/operators';
import { Airport } from './models/airport';
import { AirportService } from './services/airport.service';
import { Flight } from './models/flight';
import { Directive, OnInit, ElementRef, Input, Component } from '@angular/core';
import { Observable, from, zip, of, forkJoin } from 'rxjs';

import { interpolateRainbow } from 'd3-scale-chromatic';
import * as Cesium from 'cesium';
import { JulianDate } from 'cesium';

/*
const createPositions = function (route) {
  // https://gis.stackexchange.com/questions/194649/arcs-circle-segments-in-cesium/200246
  console.log('Creating Positions for ', route);
  // Calcuate Midpoint
  const φ1 = route.fromAp.latitude * Math.PI / 180;
  const λ1 = route.fromAp.longitude * Math.PI / 180;

  const φ2 = route.toAp.latitude * Math.PI / 180;
  const λ2 = route.toAp.longitude * Math.PI / 180;

  var Bx = Math.cos(φ2) * Math.cos(λ2 - λ1);
  var By = Math.cos(φ2) * Math.sin(λ2 - λ1);
  var φ3 = Math.atan2(Math.sin(φ1) + Math.sin(φ2),
    Math.sqrt((Math.cos(φ1) + Bx) * (Math.cos(φ1) + Bx) + By * By));
  var λ3 = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);

  const midpointLatitude = φ3 * 180 / Math.PI;
  const midpointLongitude = λ3 * 180 / Math.PI;


  route.name = [route.fromAp.code, route.toAp.code].sort().join();
  route.
    positions = Cesium.Cartesian3.fromDegreesArrayHeights([
      route.fromAp.longitude, route.fromAp.latitude, 0,
      midpointLongitude, midpointLatitude, 100000,
      route.toAp.longitude, route.toAp.latitude, 0]);

  return route;
};
*/

@Component({
  selector: 'app-cesium',
  template: '<div></div>'
})
export class CesiumDirective implements OnInit {
  @Input()
  private flights: Observable<Array<Flight>>;

  @Input()
  private timelineMode = true;

  private routeEntities = new Array<Cesium.Entity>();

  private maxLongitude = -400.0;
  private minLongitude = 400.0;
  private maxLatitude = -400.0;
  private minLatitude = 400.0;

  constructor(private element: ElementRef, private airportService: AirportService) {
    //   Cesium.BingMapsApi.defaultKey = 'Arvxz11onv0TmhTvn0mMzbRDEVJ59LI35MI6YScmvQS3jzwzORkEZAv1Xs987i0T';
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkYWYxNzUzZi0yNjliLTQyYjYtYjJiYy1iZDk0YWUxYjQ4N2QiLCJpZCI6MjI2OCwiaWF0IjoxNTMyMzczMDQ0fQ.oWuIYi0TtUbwYeRHj5rE3nTI53c3v5HF8UJHgjehxoM';
  }


  private viewer: any;

  ngOnInit() {
    // Put initialization code for the Cesium viewer here
    this.viewer = new Cesium.Viewer(this.element.nativeElement, {
      sceneMode: this.timelineMode ? Cesium.SceneMode.SCENE3D : Cesium.SceneMode.COLUMBUS_VIEW,
      animation: this.timelineMode,
      timeline: this.timelineMode,

    });

    const colorFunction = interpolateRainbow;
    this.flights
      .pipe(
        debounceTime(100),
        mergeMap(flightArray => {
          // remove any entities from the globe.
          this.routeEntities.forEach((entity) => {
            this.viewer.entities.remove(entity);
          });
          this.routeEntities = new Array();
          let totalFlights = 0;
          let flightNumber = 0;
          return from(flightArray)
            // Remove Duplicates
            .pipe(
              groupBy(flight => flight.from + flight.to),
              mergeMap(group => group.pipe(toArray())),
              map(flightArray => flightArray[0]),
              tap(() => {
                totalFlights = totalFlights + 1;
              })
            )
            .pipe(mergeMap(flight =>
                zip(
                  this.airportService.loadAirport(flight.from),
                  this.airportService.loadAirport(flight.to),
                  (fromAp: Airport, toAp: Airport) => {
                    this.maxLatitude = Math.max(this.maxLatitude, fromAp.latitude, toAp.latitude);
                    this.maxLongitude = Math.max(this.maxLongitude, fromAp.longitude, toAp.longitude);
                    this.minLatitude = Math.min(this.minLatitude, fromAp.latitude, toAp.latitude);
                    this.minLongitude = Math.min(this.minLongitude, fromAp.longitude, toAp.longitude);
                    const f = new CesiumFlight();
                    f.departureTime = new Date(flight.departureTime);
                    f.arrivalTime = new Date(flight.arrivalTime);
                    f.fromAp = fromAp;
                    f.toAp = toAp;
                    return f;
                  }))
              ,
              filter(f => {
                if (f.fromAp && f.toAp) {
                  return true;
                } else {
                  return false;
                }
              }),
              tap(flight => {
                const color = colorFunction(flightNumber++ / totalFlights);
                this.routeEntities.push(this.drawFlight(flight, color));
              })
            );
        }),
        debounceTime(300)
      )

      .subscribe(() => {
        var west = this.minLongitude-5.0;
        var south = this.minLatitude-5.0;
        var east = this.maxLongitude+5.0;
        var north = this.maxLatitude+5.0;
        var rectangle = this.viewer.entities.add({
          rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
            show: true,
            material: new Cesium.Color(0.0, 0.0, 0.0,0.0)
          },
        });
        this.viewer.flyTo(rectangle);
    });

  }


  drawFlight(route, colorString?) {
    const color = Cesium.Color.fromCssColorString(colorString ? colorString : '#FFB300');
    // https://stackoverflow.com/questions/37381658/polyline-arcs-above-surface-in-cesium

    const departure = this.timelineMode ? new Date(route.departureTime) : new Date(Date.now()-600000);
    const arrival = this.timelineMode ? new Date(route.arrivalTime): new Date(Date.now()-100000);;
    const startTime = Cesium.JulianDate.fromDate(departure, new Cesium.JulianDate()); // this.viewer.clock.startTime;
    var stopTime = Cesium.JulianDate.fromDate(arrival, new Cesium.JulianDate());

    const durationSeconds = Math.min(55, Cesium.JulianDate.secondsDifference(startTime, stopTime));
    const midTime = Cesium.JulianDate.addSeconds(startTime, (durationSeconds / 2.0), new Cesium.JulianDate());
    stopTime = Cesium.JulianDate.addSeconds(startTime, durationSeconds, new Cesium.JulianDate());

    //console.log("Route:", route, departure, arrival, durationSeconds, midTime);


    // Create a straight-line path.
    var property = new Cesium.SampledPositionProperty();

    // For some reason, we nee to use the fromAp as stop Position here and to as start...
    const stopPosition = Cesium.Cartesian3.fromDegrees(route.fromAp.longitude, route.fromAp.latitude, 0);
    const startPosition = Cesium.Cartesian3.fromDegrees(route.toAp.longitude, route.toAp.latitude, 0);

    property.addSample(startTime, startPosition);
    property.addSample(stopTime, stopPosition);

    const distance = Cesium.Cartesian3.distance(startPosition, stopPosition); // TODO: Distance is linear

    // Find the midpoint of the straight path, and raise its altitude.
    var midPoint = Cesium.Cartographic.fromCartesian(property.getValue(midTime));
    midPoint.height = Cesium.Math.nextRandomNumber() * 100000 + Math.sqrt(distance) * 500;
    var midPosition = this.viewer.scene.globe.ellipsoid.cartographicToCartesian(
      midPoint, new Cesium.Cartesian3());

    // Redo the path to be the new arc.
    property = new Cesium.SampledPositionProperty();
    property.addSample(startTime, startPosition);
    property.addSample(midTime, midPosition);
    property.addSample(stopTime, stopPosition);

    // Create an Entity to show the arc.
    var arcEntity = this.viewer.entities.add({
      position: property,
      // The point is optional, I just wanted to see it.
      point: {
        pixelSize: 8,
        color: Cesium.Color.TRANSPARENT,
        outlineColor: color,
        outlineWidth: 3
      },
      // This path shows the arc as a polyline.
      path: {
        name: route.name,
        resolution: 100,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.16,
          color: color
        }),
        width: 5, //Math.min(20, route.count / 3.0) + 5.0,//10,
        leadTime: 0,
        trailTime: 1e10
      }
    });
    // This is where it becomes a smooth path.
    arcEntity.position.setInterpolationOptions({
      interpolationDegree: 5,
      interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
    });
    return arcEntity;
  }
}

class CesiumFlight {
  departureTime: Date;
  arrivalTime: Date;
  fromAp: Airport;
  toAp: Airport;
}

class Route extends CesiumFlight {
  name: string;
  count: number;
  positions: any;
}

