export class Flight {
  _id: string;
  name: string;

  flightno: string;
  from: string;
  to: string;

  departureTime: Date;
  arrivalTime: Date;

  distance: Number;
  aircraftType: string;

  aircraftRegistration: string;
  seat: string;
  seatType: string;
  class: string;

  carrier: string;
  reason: string;
  note: string;
  filekey: string;

  created: Date;
  user: string;
}