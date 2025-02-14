export class Airport {
  code: string;
  name: string;
  timezoneId: string;
  latitude: number;
  longitude: number;
  created: Date;
  country?: Country;
}

export class Country {
  continent: string;
  region: string;
  country: string;
  capital: string;
  fips: string;
  iso2: string;
  iso3: string;
  isoNo: string;
  internet: string
}
