import { Flight } from './../models/flight';
import { Component, OnInit } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/database';
import { from, Observable } from 'rxjs';
import { flatMap, map, reduce } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/auth';
import { FlightsService } from '../services/flights.service';

@Component({
  selector: 'app-flight-list',
  templateUrl: './flight-list.component.html',
  styleUrls: ['./flight-list.component.css']
})
export class FlightListComponent implements OnInit {
  // https://angularfirebase.com/lessons/infinite-scroll-with-firebase-data-and-angular-animation/
  flights: Observable<Flight[]>;

  stats: Observable<Stats>;

  userId: string;

  constructor(private flightsService: FlightsService) {
  }

  ngOnInit() {

    const flightList = this.flightsService.getFlights();
    this.flights = flightList
      .pipe(
        map(flights => flights.sort((a: Flight, b: Flight) => {
          if ((a.departureTime && !b.departureTime) || a.departureTime < b.departureTime) {
            return 1;
          } else if ((!a.departureTime && b.departureTime) || a.departureTime > b.departureTime) {
            return -1;
          } else {
            return 0;
          }
        }))
      );
    this.stats = flightList.pipe(
      flatMap(flightArray => from(flightArray)
        .pipe(
          reduce<Flight, Stats>(
            (stats, flight) => {

              stats.count += 1;
              stats.distance += flight.distance;
              return stats;
            },
            new Stats()),
          map(stats => {
            stats.distance = Math.round(stats.distance);
            return stats;
          })
        )
      )
    );

  }
}

class Stats {
  count = 0;
  distance = 0;
}
