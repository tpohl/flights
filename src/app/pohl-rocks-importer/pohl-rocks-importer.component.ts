import { Component, OnInit } from '@angular/core';
import { Flight } from 'functions/src/models/flight';

@Component({
  selector: 'app-pohl-rocks-importer',
  templateUrl: './pohl-rocks-importer.component.html',
  styleUrls: ['./pohl-rocks-importer.component.css']
})
export class PohlRocksImporterComponent implements OnInit {

  importJson: string;

  flights: Array<Flight> ;

  constructor() { }

  ngOnInit() {
    this.flights = [];
  }

  parseFlights(){
    console.log('JSON': this.importJson);
    this.flights = JSON.parse(this.importJson);
    console.log('Imported: ', this.flights.length);
  }

}
