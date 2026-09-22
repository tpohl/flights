/**
 * AeroAPI flight completion and refresh lifecycle.
 */

import * as admin from "firebase-admin";
import * as jwt from "jsonwebtoken";
import { onRequest } from "firebase-functions/v2/https";
import { onValueCreated, onValueUpdated, onValueWritten } from "firebase-functions/v2/database";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineJsonSecret } from "firebase-functions/params";
import { log, warn } from "firebase-functions/logger";
import { Flight, AeroApiEnrichment } from "../models/flight";
import loadFlight from "../util/loadFlight";
import saveFlightAndReturnIt, { SaveFlightResult } from "../util/saveFlight";
import {
  loadAeroApiFlights,
  loadAeroApiTrack,
} from "./aero-api/loadFlight";
import {
  FlightDateOutsideAeroApiWindowError,
  InvalidFlightNumberError,
  aeroApiFlightMatchesDesignator,
  buildFlightSearchWindow,
  matchAeroApiFlight,
  normalizeFlightNumber,
} from "./aero-api/matcher";
import {
  AeroApiBudgetExceededError,
  AeroApiBudgetUnavailableError,
} from "./aero-api/budget";
import { applyAeroApiFlight, isFinalAeroApiResult } from "./aero-api/transformer";
import {
  acquireEnrichmentLock,
  internalKey,
  makeRefreshJob,
  RefreshJob,
  releaseEnrichmentLock,
  retryRefreshJobAfterFailure,
} from "./aero-api/lifecycle";
import { AeroApiFlight, AeroAPITrackResponse } from "./aero-api/models";
import { PersistenceError } from "../util/persistenceError";

const config = defineJsonSecret("FLIGHTS_CONFIG");
const MAX_REFRESH_JOBS = 3;
const MAX_LOCK_RERUNS = 3;

interface AutocompleteContext {
  userId?: string;
  flightId?: string;
  attempts?: number;
  expectedFaFlightId?: string;
  now?: Date;
}

const internalRoot = (database = admin.database()) => database.ref("/internal");
const queueRef = (database = admin.database()) => internalRoot(database).child("aeroApiRefreshQueue");
const lockRef = () => internalRoot().child("aeroApiEnrichmentLocks");

const ownedError = (flight: Flight) => flight.aeroApiEnrichment?.message;

const setEnrichmentError = (flight: Flight, message?: string) => {
  if (message) {
    if (!flight.errorMessage || flight.errorMessage === ownedError(flight)) {
      flight.errorMessage = message;
    }
  } else if (flight.errorMessage && flight.errorMessage === ownedError(flight)) {
    flight.errorMessage = null;
  }
};

const saveOutcome = async (
  ref: admin.database.Reference,
  original: Flight,
  state: AeroApiEnrichment["state"],
  now: Date,
  message?: string,
  candidateCount?: number
) => {
  const flight = { ...original };
  setEnrichmentError(flight, message);
  flight.aeroApiEnrichment = {
    state,
    lastAttemptAt: now.toISOString(),
    ...(candidateCount === undefined ? {} : { candidateCount }),
    ...(message === undefined ? {} : { message }),
  };
  flight.needsAutocomplete = false;
  return saveFlightAndReturnIt(ref, original, flight);
};

const readTrack = async (
  flightRef: admin.database.Reference,
  faFlightId: string
): Promise<AeroAPITrackResponse | null> => {
  const snapshot = await flightRef.parent!.parent!.child("aeroApiTracks").child(faFlightId)
    .once("value").catch((cause) => {
      throw new PersistenceError("Could not read cached AeroAPI track.", cause);
    });
  return snapshot.val() as AeroAPITrackResponse | null;
};

const persistLifecycle = async (
  flightRef: admin.database.Reference,
  context: AutocompleteContext,
  candidate: AeroApiFlight,
  result: SaveFlightResult,
  track: AeroAPITrackResponse | null,
  now: Date
) => {
  if (!context.userId || !context.flightId ||
      (result.status !== "saved" && result.status !== "unchanged") ||
      result.flight?.flightAwareFlightId !== candidate.fa_flight_id) return;
  const key = internalKey(context.userId, context.flightId);
  const jobRef = queueRef().child(key);
  if (isFinalAeroApiResult(candidate, track)) {
    const recoveryJob = makeRefreshJob(
      context.userId, context.flightId, result.flight.flightno, result.flight.date,
      candidate, context.attempts || 0, now
    );
    if (recoveryJob) await jobRef.set(recoveryJob);
  } else {
    const job = makeRefreshJob(
      context.userId, context.flightId, result.flight.flightno, result.flight.date,
      candidate, context.attempts || 0, now
    );
    if (job) await jobRef.set(job);
    else await jobRef.remove();
  }
  if (track) {
    await flightRef.parent!.parent!.child("aeroApiTracks").child(candidate.fa_flight_id)
      .set(track).catch((cause) => {
        throw new PersistenceError("Could not save AeroAPI track.", cause);
      });
  }
  if (isFinalAeroApiResult(candidate, track)) {
    await jobRef.remove();
  }
};

const autocompleteUnlocked = async (
  flightRef: admin.database.Reference,
  context: AutocompleteContext
): Promise<SaveFlightResult> => {
  const now = context.now || new Date();
  const original = await loadFlight(flightRef);
  if (!original || original._deleted) {
    return { status: original ? "deleted" : "missing", flight: original || null };
  }
  if (context.expectedFaFlightId &&
      original.flightAwareFlightId !== context.expectedFaFlightId) {
    if (context.userId && context.flightId) {
      await queueRef().child(internalKey(context.userId, context.flightId)).remove();
    }
    return { status: "stale", flight: original };
  }

  let normalized: string;
  try {
    normalized = normalizeFlightNumber(original.flightno);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid flight number.";
    return saveOutcome(flightRef, original, "error", now, message);
  }

  let candidate: AeroApiFlight | undefined;
  let track: AeroAPITrackResponse | null = null;
  let trackProblem: {
    state: "budget_blocked" | "error";
    message: string;
  } | undefined;
  let candidateCount = 0;
  let simpleOutcome: {
    state: AeroApiEnrichment["state"];
    message: string;
    candidateCount?: number;
  } | undefined;
  let usingStoredCandidate = false;
  try {
    const storedProviderMatches = aeroApiFlightMatchesDesignator(
      original.aeroApiFlight, normalized
    );
    let candidates: AeroApiFlight[];
    if (storedProviderMatches) {
      try {
        buildFlightSearchWindow(original.date, now);
        candidates = await loadAeroApiFlights(normalized, original.date, now);
      } catch (err) {
        if (!(err instanceof FlightDateOutsideAeroApiWindowError)) {
          throw err;
        }
        candidates = [original.aeroApiFlight];
        usingStoredCandidate = true;
      }
    } else {
      buildFlightSearchWindow(original.date, now);
      candidates = await loadAeroApiFlights(normalized, original.date, now);
    }
    const routeIsInitialOrCurrent = storedProviderMatches ||
      (!original.flightAwareFlightId && !original.aeroApiFlight);
    const match = usingStoredCandidate ?
      { state: "matched" as const, flight: original.aeroApiFlight, candidateCount: 1 } :
      matchAeroApiFlight(normalized, original.date, candidates, {
        from: routeIsInitialOrCurrent ||
          original.manualOverrides?.from === true ? original.from : undefined,
        to: routeIsInitialOrCurrent ||
          original.manualOverrides?.to === true ? original.to : undefined,
      });
    candidateCount = match.candidateCount;
    if (match.state === "not_found") {
      simpleOutcome = {
        state: "not_found", message: "No matching AeroAPI flight was found.",
        candidateCount: match.candidateCount,
      };
    } else if (match.state === "ambiguous") {
      simpleOutcome = {
        state: "ambiguous",
        message: `AeroAPI returned ${match.candidateCount} matching flights; add the route to disambiguate.`,
        candidateCount: match.candidateCount,
      };
    } else {
      candidate = match.flight;
      track = (usingStoredCandidate || candidate.fa_flight_id === original.flightAwareFlightId) ?
        await readTrack(flightRef, candidate.fa_flight_id) :
        null;
      const cachedFinal = Boolean(candidate.actual_in && track && track.actual_distance > 0 &&
        !(track.positions || []).some((position) => position.update_type === "P"));
      if (!cachedFinal && !usingStoredCandidate) {
        try {
          track = await loadAeroApiTrack(candidate.fa_flight_id, !candidate.actual_in, now);
        } catch (err) {
          if (err instanceof PersistenceError) throw err;
          if (err instanceof AeroApiBudgetExceededError ||
              err instanceof AeroApiBudgetUnavailableError) {
            trackProblem = { state: "budget_blocked", message: err.message };
          } else {
            warn("AeroAPI track enrichment failed", err);
            trackProblem = {
              state: "error",
              message: "Flight details were found, but its track could not be loaded.",
            };
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof PersistenceError) throw err;
    if (err instanceof FlightDateOutsideAeroApiWindowError) {
      return saveOutcome(flightRef, original, "outside_window", now, err.message);
    }
    if (err instanceof AeroApiBudgetExceededError || err instanceof AeroApiBudgetUnavailableError) {
      return saveOutcome(flightRef, original, "budget_blocked", now, err.message);
    }
    if (err instanceof InvalidFlightNumberError) {
      return saveOutcome(flightRef, original, "error", now, err.message);
    }
    warn("AeroAPI enrichment failed", err);
    return saveOutcome(
      flightRef, original, "error", now,
      "AeroAPI enrichment failed. Please retry later."
    );
  }
  if (simpleOutcome) {
    return saveOutcome(
      flightRef, original, simpleOutcome.state, now,
      simpleOutcome.message, simpleOutcome.candidateCount
    );
  }
  if (!candidate) {
    return saveOutcome(flightRef, original, "error", now, "AeroAPI returned unusable data.");
  }
  const final = isFinalAeroApiResult(candidate, track);
  const nextJob = final ? null : makeRefreshJob(
    context.userId || "", context.flightId || "", normalized, original.date,
    candidate, context.attempts || 0, now
  );
  const enrichment: AeroApiEnrichment = {
    state: trackProblem?.state ||
      (final ? "final" : candidate.actual_out ? "partial" : "scheduled"),
    candidateCount,
    lastAttemptAt: now.toISOString(),
    attempts: context.attempts || 0,
    ...(nextJob?.nextAttemptAt ? { nextRefreshAt: nextJob.nextAttemptAt } : {}),
    ...(trackProblem?.message ? { message: trackProblem.message } : {}),
  };
  const enriched = applyAeroApiFlight(original, candidate, track, enrichment);
  if (trackProblem &&
      (!original.errorMessage || original.errorMessage === ownedError(original))) {
    enriched.errorMessage = trackProblem.message;
  } else if (!trackProblem &&
      original.errorMessage && original.errorMessage === ownedError(original)) {
    enriched.errorMessage = null;
  }
  enriched.needsAutocomplete = false;
  const result = await saveFlightAndReturnIt(flightRef, original, enriched);
  await persistLifecycle(flightRef, context, candidate, result, track, now);
  return result;
};

export const autocompleteFlight = async (
  flightRef: admin.database.Reference,
  context: AutocompleteContext = {}
): Promise<SaveFlightResult> => {
  if (!context.userId || !context.flightId) return autocompleteUnlocked(flightRef, context);
  let runContext = context;
  for (let run = 0; run < MAX_LOCK_RERUNS; run++) {
    const token = await acquireEnrichmentLock(
      lockRef(), context.userId, context.flightId, context.now
    );
    if (!token) {
      return { status: "unchanged", flight: await loadFlight(flightRef) };
    }
    let result: SaveFlightResult | undefined;
    let failure: unknown;
    let rerunRequested = false;
    try {
      result = await autocompleteUnlocked(flightRef, runContext);
    } catch (err) {
      failure = err;
    } finally {
      try {
        rerunRequested = await releaseEnrichmentLock(
          lockRef(), context.userId, context.flightId, token
        );
      } catch (err) {
        warn("Could not release AeroAPI enrichment lock; it will expire.", err);
      }
    }
    if (rerunRequested && run + 1 < MAX_LOCK_RERUNS) {
      runContext = {
        userId: context.userId,
        flightId: context.flightId,
        now: context.now,
      };
      continue;
    }
    if (failure) throw failure;
    return result!;
  }
  return { status: "unchanged", flight: await loadFlight(flightRef) };
};

export const autocompleteAircraftType = async (
  flightRef: admin.database.Reference
): Promise<SaveFlightResult> => {
  const flight = await loadFlight(flightRef);
  if (!flight || flight._deleted) {
    return { status: flight ? "deleted" : "missing", flight: flight || null };
  }
  return { status: "unchanged", flight };
};

const triggerAutocomplete = (event: any) => autocompleteFlight(event.data.after?.ref.parent ||
  event.data.ref.parent, event.params);

export const triggerAutocompleteOnCreate = async (event: any) => {
  const flightRef = event.data.ref.parent;
  if (!event.id) throw new Error("Flight-number create event is missing its event ID.");
  const eventId = String(event.id);
  const result = await flightRef.transaction((flight: Flight | null) => {
    if (!flight) return flight;
    const metadata = flight.importMetadata;
    if (metadata?.suppressInitialEnrichment === true) {
      return {
        ...flight,
        importMetadata: {
          ...metadata,
          suppressInitialEnrichment: false,
          suppressedCreateEventId: eventId,
        },
      };
    }
    return undefined;
  }, undefined, false);
  const flight = result.snapshot.val() as Flight | null;
  if (!flight) return null;
  if (flight.importMetadata?.suppressedCreateEventId === eventId) return null;
  return autocompleteFlight(flightRef, event.params);
};

// Export names are retained to avoid replacing deployed trigger resources.
export const lufthansaApiAutocompletion = onValueUpdated(
  { ref: "/users/{userId}/flights/{flightId}/flightno", secrets: [config] },
  triggerAutocomplete
);
export const lufthansaApiAutocompletionOnCreate = onValueCreated(
  { ref: "/users/{userId}/flights/{flightId}/flightno", secrets: [config] },
  triggerAutocompleteOnCreate
);
export const autocompletionRequested = onValueUpdated(
  { ref: "/users/{userId}/flights/{flightId}/needsAutocomplete", secrets: [config] },
  (event) => event.data.after.val() ? triggerAutocomplete(event) : null
);
export const autocompletionRequestedCreate = onValueCreated(
  { ref: "/users/{userId}/flights/{flightId}/needsAutocomplete", secrets: [config] },
  (event) => event.data.val() ? triggerAutocomplete(event) : null
);
export const flightAcTypeCodeUpdated = onValueWritten(
  { ref: "/users/{userId}/flights/{flightId}/aircraftTypeCode" },
  (event) => event.data.after.val() ? autocompleteAircraftType(event.data.after.ref.parent!) : null
);

export const processAeroApiRefreshQueue = async (
  now = new Date(),
  options: {
    database?: admin.database.Database;
    worker?: typeof autocompleteFlight;
  } = {}
) => {
  const database = options.database || admin.database();
  const worker = options.worker || autocompleteFlight;
  const queue = queueRef(database);
  const snapshot = await queue.orderByChild("nextAttemptAt")
    .endAt(now.toISOString()).limitToFirst(MAX_REFRESH_JOBS).once("value");
  const jobs = (snapshot.val() || {}) as Record<string, RefreshJob>;
  for (const [key, job] of Object.entries(jobs).slice(0, MAX_REFRESH_JOBS)) {
    try {
      if (job.attempts >= 3) {
        await queue.child(key).remove();
        continue;
      }
      const ref = database.ref(`/users/${job.userId}/flights/${job.flightId}`);
      const result = await worker(ref, {
        userId: job.userId,
        flightId: job.flightId,
        attempts: job.attempts + 1,
        expectedFaFlightId: job.faFlightId,
        now,
      });
      if (result.status === "missing" || result.status === "deleted" || result.status === "stale") {
        await queue.child(key).remove();
      } else {
        const state = result.flight?.aeroApiEnrichment?.state;
        if (state === "final") {
          await queue.child(key).remove();
        } else if (state && state !== "scheduled" && state !== "partial") {
          const attempts = job.attempts + 1;
          const candidate = result.flight?.aeroApiFlight;
          const retry = candidate && attempts < 3 ?
            makeRefreshJob(
              job.userId, job.flightId, job.flightno, job.date, candidate, attempts, now
            ) :
            null;
          if (retry) await queue.child(key).set(retry);
          else await queue.child(key).remove();
        }
      }
    } catch (err) {
      warn("AeroAPI refresh job failed", { key, error: err });
      try {
        const retry = retryRefreshJobAfterFailure(job, now);
        if (retry) await queue.child(key).set(retry);
        else await queue.child(key).remove();
      } catch (queueError) {
        warn("Could not update failed AeroAPI refresh job", { key, error: queueError });
      }
    }
  }
};

export const aeroApiScheduledRefresh = onSchedule(
  { schedule: "every 60 minutes", secrets: [config] },
  () => processAeroApiRefreshQueue()
);

export const autocomplete = onRequest(
  { secrets: [config] },
  async (req, res) => {
    let request: { userId: string; flightId: string };
    try {
      request = jwt.verify(req.body, config.value().jwt.secret) as typeof request;
    } catch (err) {
      warn("Invalid HTTP autocomplete token", err);
      res.status(400).send("NOT OK");
      return;
    }
    try {
      const result = await autocompleteFlight(
        admin.database().ref(`/users/${request.userId}/flights/${request.flightId}`),
        request
      );
      if (!["saved", "unchanged"].includes(result.status)) {
        res.status(409).send(`Enrichment discarded: ${result.status}`);
      } else if (result.flight?.aeroApiEnrichment?.state === "error") {
        res.status(502).send("Enrichment failed");
      } else {
        log("Autocompleted via HTTP trigger");
        res.status(200).send("OK");
      }
    } catch (err) {
      warn("HTTP autocomplete error", err);
      res.status(500).send("Could not persist enrichment");
    }
  }
);
