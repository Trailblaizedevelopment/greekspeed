/**
 * Best-effort per-user rate limit for suggest (in-memory per server instance).
 * Optional env: GEOCODING_SUGGEST_RATE_LIMIT_MAX (default 60), GEOCODING_SUGGEST_RATE_LIMIT_WINDOW_SEC (default 60).
 */

type WindowEntry = { windowStartMs: number; count: number };

const store = new Map<string, WindowEntry>();

function parsePositiveInt(value: string | undefined, fallback: number, cap: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), cap);
}

function getLimits(): { max: number; windowMs: number } {
  return {
    max: parsePositiveInt(process.env.GEOCODING_SUGGEST_RATE_LIMIT_MAX, 60, 500),
    windowMs: parsePositiveInt(process.env.GEOCODING_SUGGEST_RATE_LIMIT_WINDOW_SEC, 60, 600) * 1000,
  };
}

function pruneStale(now: number, windowMs: number): void {
  if (store.size < 2500) return;
  const cutoff = now - 2 * windowMs;
  for (const [key, entry] of store) {
    if (entry.windowStartMs < cutoff) {
      store.delete(key);
    }
  }
}

/**
 * @returns whether the request may proceed; if not, seconds until the window resets.
 */
export function consumeGeocodingSuggestRateLimit(userId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const { max, windowMs } = getLimits();
  const now = Date.now();
  pruneStale(now, windowMs);

  const entry = store.get(userId);
  if (!entry || now - entry.windowStartMs >= windowMs) {
    store.set(userId, { windowStartMs: now, count: 1 });
    return { ok: true };
  }

  if (entry.count >= max) {
    const retryAfterMs = entry.windowStartMs + windowMs - now;
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return { ok: false, retryAfterSec };
  }

  entry.count += 1;
  return { ok: true };
}
