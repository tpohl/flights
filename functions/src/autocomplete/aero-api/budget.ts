import type * as admin from "firebase-admin";
import { randomUUID } from "node:crypto";
import { PersistenceError } from "../../util/persistenceError";

export const AERO_API_HARD_LIMIT_USD = 4.50;
const USAGE_CACHE_MS = 5 * 60 * 1000;
const LAG_BUFFER_MS = 15 * 60 * 1000;
const MAX_RESERVATIONS = 200;

export class AeroApiBudgetExceededError extends Error {}
export class AeroApiBudgetUnavailableError extends Error {}

interface UsageResponse {
  total_cost?: number;
  total_discount_cost?: number;
}

interface Reservation {
  endpoint: string;
  cost: number;
  timestamp: number;
}

let usageCache: { month: string; fetchedAt: number; spend: number } | undefined;

export const resetAeroApiUsageCacheForTests = () => {
  usageCache = undefined;
};

const monthKey = (now: Date) => now.toISOString().slice(0, 7);
const monthStart = (now: Date) => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return start.toISOString();
};

export const loadAccountSpend = async (
  apiKey: string,
  fetchImpl: typeof fetch,
  now = new Date()
): Promise<number> => {
  const month = monthKey(now);
  if (usageCache?.month === month && now.valueOf() - usageCache.fetchedAt < USAGE_CACHE_MS) {
    return usageCache.spend;
  }
  const params = new URLSearchParams({
    start: monthStart(now),
    all_keys: "true",
  });
  let response: Response;
  try {
    response = await fetchImpl(`https://aeroapi.flightaware.com/aeroapi/account/usage?${params}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "Accept": "application/json; charset=UTF-8", "x-apikey": apiKey },
    });
  } catch (cause) {
    throw new AeroApiBudgetUnavailableError("Could not verify AeroAPI account usage.", { cause });
  }
  if (!response.ok) {
    throw new AeroApiBudgetUnavailableError(
      `Could not verify AeroAPI account usage (HTTP ${response.status}).`
    );
  }
  const body = await response.json() as UsageResponse;
  const validSpend = [body.total_cost, body.total_discount_cost]
    .filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value >= 0);
  if (!validSpend.length) {
    throw new AeroApiBudgetUnavailableError("AeroAPI returned invalid account usage.");
  }
  const spend = Math.max(...validSpend);
  usageCache = { month, fetchedAt: now.valueOf(), spend };
  return spend;
};

export const reserveAeroApiBudget = async (
  budgetRoot: admin.database.Reference,
  endpoint: string,
  cost: number,
  accountSpend: number,
  now = new Date()
): Promise<void> => {
  const ref = budgetRoot.child(monthKey(now));
  let committed = false;
  try {
    const result = await ref.transaction((current: {
      reservations?: Record<string, Reservation>;
    } | null) => {
      const reservations = Object.entries(current?.reservations || {})
        .filter(([, item]) => item && now.valueOf() - Number(item.timestamp) < LAG_BUFFER_MS)
        .sort(([, left], [, right]) => Number(left.timestamp) - Number(right.timestamp));
      const reserved = reservations.reduce((total, [, item]) => total + Number(item.cost || 0), 0);
      if (accountSpend + reserved + cost > AERO_API_HARD_LIMIT_USD) {
        return undefined;
      }
      if (reservations.length >= MAX_RESERVATIONS) {
        return undefined;
      }
      const key = `${now.valueOf()}-${randomUUID()}`;
      reservations.push([key, { endpoint, cost, timestamp: now.valueOf() }]);
      return {
        updatedAt: now.toISOString(),
        reservations: Object.fromEntries(reservations),
      };
    }, undefined, false);
    committed = result.committed;
  } catch (cause) {
    throw new PersistenceError("Could not reserve AeroAPI budget.", cause);
  }
  if (!committed) {
    throw new AeroApiBudgetExceededError(
      "AeroAPI enrichment paused to keep monthly account spend below $4.50."
    );
  }
};

export const guardAeroApiCall = async (
  budgetRoot: admin.database.Reference,
  apiKey: string,
  endpoint: string,
  cost: number,
  fetchImpl: typeof fetch,
  now = new Date()
) => {
  const spend = await loadAccountSpend(apiKey, fetchImpl, now);
  await reserveAeroApiBudget(budgetRoot, endpoint, cost, spend, now);
};
