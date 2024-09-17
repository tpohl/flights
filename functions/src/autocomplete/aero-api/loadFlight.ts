const functions = require('firebase-functions');
const config = functions.config();
import { RxHR } from '@akanass/rx-http-request';
import { AeroApiFlight, AeroAPIIdentResponse, AeroAPIOperator, AeroAPITrackResponse } from './models';
import { map, mergeMap } from 'rxjs/operators';
import { from, Observable, of } from 'rxjs';
import { DataSnapshot } from 'firebase-admin/database';

const admin = require('firebase-admin');

export const loadOperator = function(iata: string){
    const ref = admin.database().ref('/operators/' + iata);
    const operator$ =from(ref.once('value')) as Observable<DataSnapshot>;
    return operator$
    .pipe(mergeMap(snapshot => {
        if (snapshot.exists()){
            return of(snapshot.val() as AeroAPIOperator)
        } else {
            return RxHR.get<AeroAPIOperator>(`https://aeroapi.flightaware.com/aeroapi/operators/${iata}`,
                {
                    headers: {
                        'Accept': 'application/json; charset=UTF-8',
                        'x-apikey': config.aeroapi.apikey
                    },
                    json: true
                })
                .pipe(
                    map(response => response.body),
                    mergeMap(newOperator => from(ref.set(newOperator)) // This is a promise
                    .pipe(
                      map(() => newOperator)
                    ))
                )
        }
    })
)
}

export const loadAeroApiFlight = function (carrier: string, flightNo: string, dateStr: string): Observable<AeroApiFlight> {
    console.info(`Loading Aero API Flight ${carrier}${flightNo} on ${dateStr}`)
    return RxHR.get<AeroAPIIdentResponse>(`https://aeroapi.flightaware.com/aeroapi/flights/${carrier}${flightNo}?start=${dateStr}&end=${dateStr}T23:59:59Z`,
        {
            headers: {
                'Accept': 'application/json; charset=UTF-8',
                'x-apikey': config.aeroapi.apikey
            },
            json: true
        })
        .pipe(
            map(response => response.response.statusCode == 200 ? response.body.flights[0] : null)
        )
}

export const loadAeroApiTrack = function (fa_flight_id: string): Observable<AeroAPITrackResponse> {
    return RxHR.get<AeroAPITrackResponse>(`https://aeroapi.flightaware.com/aeroapi/flights/${fa_flight_id}/track?include_estimated_positions=true`,
        {
            headers: {
                'Accept': 'application/json; charset=UTF-8',
                'x-apikey': config.aeroapi.apikey
            },
            json: true
        })
        .pipe(
            map(response => response.body)
        )
}