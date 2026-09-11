import { createHash, randomUUID } from "node:crypto";
import type * as admin from "firebase-admin";
import { AeroApiFlight } from "./models";

const LOCK_MS = 2 * 60 * 1000;
const ARRIVAL_GRACE_MS = 45 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export interface RefreshJob {
  userId: string;
  flightId: string;
  faFlightId: string;
  flightno: string;
  date: string;
  attempts: number;
  nextAttemptAt: string;
}

export const internalKey = (userId: string, flightId: string) =>
  createHash("sha256").update(`${userId}\0${flightId}`).digest("hex");

export const acquireEnrichmentLock = async (
  lockRoot: admin.database.Reference,
  userId: string,
  flightId: string,
  now = new Date()
): Promise<string | null> => {
  const token = randomUUID();
  const result = await lockRoot.child(internalKey(userId, flightId)).transaction(
    (current: {
      token?: string;
      expiresAt?: number;
      rerunRequested?: boolean;
    } | null) => {
      if (current?.expiresAt && current.expiresAt > now.valueOf()) {
        return { ...current, rerunRequested: true };
      }
      return { token, expiresAt: now.valueOf() + LOCK_MS };
    },
    undefined,
    false
  );
  return result.committed && result.snapshot.val()?.token === token ? token : null;
};

export const releaseEnrichmentLock = async (
  lockRoot: admin.database.Reference,
  userId: string,
  flightId: string,
  token: string
): Promise<boolean> => {
  let rerunRequested = false;
  await lockRoot.child(internalKey(userId, flightId)).transaction(
    (current: { token?: string; rerunRequested?: boolean } | null) => {
      rerunRequested = current?.token === token && current.rerunRequested === true;
      return current?.token === token ? null : undefined;
    },
    undefined,
    false
  );
  return rerunRequested;
};

const arrivalAnchor = (flight: AeroApiFlight) =>
  flight.actual_in || flight.estimated_in || flight.scheduled_in;
const departureAnchor = (flight: AeroApiFlight) =>
  flight.actual_out || flight.estimated_out || flight.scheduled_out;

export const nextRefreshAt = (
  flight: AeroApiFlight,
  attempts: number,
  now = new Date()
): string | null => {
  if (attempts >= 3) return null;
  const departure = Date.parse(departureAnchor(flight) || "");
  if (!Number.isFinite(departure) || now.valueOf() > departure + 9 * DAY) return null;
  const arrival = Date.parse(arrivalAnchor(flight) || "");
  const delay = Math.min((attempts + 1) * 2 * 60 * 60 * 1000, 6 * 60 * 60 * 1000);
  const desired = Number.isFinite(arrival) ?
    Math.max(now.valueOf() + delay, arrival + ARRIVAL_GRACE_MS) :
    now.valueOf() + delay;
  return new Date(Math.min(desired, departure + 9 * DAY)).toISOString();
};

export const makeRefreshJob = (
  userId: string,
  flightId: string,
  flightno: string,
  date: string,
  candidate: AeroApiFlight,
  attempts: number,
  now = new Date()
): RefreshJob | null => {
  const next = nextRefreshAt(candidate, attempts, now);
  return next ? {
    userId, flightId, faFlightId: candidate.fa_flight_id, flightno, date,
    attempts, nextAttemptAt: next,
  } : null;
};

export const retryRefreshJobAfterFailure = (
  job: RefreshJob,
  now = new Date()
): RefreshJob | null => {
  const attempts = job.attempts + 1;
  if (attempts >= 3) return null;
  const latest = Date.parse(`${job.date}T00:00:00.000Z`) + 9 * DAY;
  if (!Number.isFinite(latest) || now.valueOf() >= latest) return null;
  const delay = Math.min(attempts * 2 * 60 * 60 * 1000, 6 * 60 * 60 * 1000);
  const nextAttempt = Math.min(now.valueOf() + delay, latest);
  if (nextAttempt <= now.valueOf()) return null;
  return { ...job, attempts, nextAttemptAt: new Date(nextAttempt).toISOString() };
};
