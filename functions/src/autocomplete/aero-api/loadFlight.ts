import * as admin from "firebase-admin";
import { error, info } from "firebase-functions/logger";
import { defineJsonSecret } from "firebase-functions/params";
import { guardAeroApiCall } from "./budget";
import { buildFlightSearchWindow, normalizeFlightNumber } from "./matcher";
import { AeroApiFlight, AeroAPIIdentResponse, AeroAPITrackResponse } from "./models";

if (!admin.apps.length) admin.initializeApp();

const config = defineJsonSecret("FLIGHTS_CONFIG");
const FLIGHT_SEARCH_COST = 0.005;
const TRACK_COST = 0.012;

const apiKey = () => config.value().aeroapi.apikey as string;
const budgetRoot = () => admin.database().ref("/internal/aeroApiBudget");
const headers = (key: string) => ({
  "Accept": "application/json; charset=UTF-8",
  "x-apikey": key,
});

export const loadAeroApiFlights = async (
  flightNumber: string,
  date: string,
  now = new Date()
): Promise<AeroApiFlight[]> => {
  const ident = normalizeFlightNumber(flightNumber);
  const window = buildFlightSearchWindow(date, now);
  const key = apiKey();
  await guardAeroApiCall(budgetRoot(), key, "flights", FLIGHT_SEARCH_COST, fetch, now);
  const params = new URLSearchParams({
    start: window.start,
    end: window.end,
    ident_type: "designator",
    max_pages: "1",
  });
  const url = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}?${params}`;
  info("Loading AeroAPI flight candidates", { ident, date });
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: headers(key),
    });
    if (!response.ok) {
      throw new Error(`AeroAPI flight lookup failed (HTTP ${response.status}).`);
    }
    const body = await response.json() as AeroAPIIdentResponse;
    return Array.isArray(body.flights) ? body.flights : [];
  } catch (err) {
    error("Error loading AeroAPI flights", err);
    throw err;
  }
};

export const loadAeroApiTrack = async (
  faFlightId: string,
  includeEstimatedPositions: boolean,
  now = new Date()
): Promise<AeroAPITrackResponse> => {
  const key = apiKey();
  await guardAeroApiCall(budgetRoot(), key, "track", TRACK_COST, fetch, now);
  const params = new URLSearchParams({
    include_estimated_positions: String(includeEstimatedPositions),
  });
  const url = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(faFlightId)}/track?${params}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: headers(key),
    });
    if (!response.ok) {
      throw new Error(`AeroAPI track lookup failed (HTTP ${response.status}).`);
    }
    const track = await response.json() as AeroAPITrackResponse;
    return {
      ...track,
      positions: (track.positions || []).filter((position) =>
        position.altitude > 0 &&
        (includeEstimatedPositions || position.update_type !== "P")),
    };
  } catch (err) {
    error("Error loading AeroAPI track", err);
    throw err;
  }
};
