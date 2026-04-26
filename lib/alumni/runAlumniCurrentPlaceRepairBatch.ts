import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePlaceFromLocationTextForStorage } from '@/lib/mapbox/resolvePlaceFromLocationTextForStorage';
import { deriveWorkStateCodeFromCanonicalPlace } from '@/lib/alumni/workStateCode';

const PAGE = 1000;
/** Max distinct `location` strings to geocode per invocation (Mapbox rate limits / cron time). */
const MAX_DISTINCT = 35;

function isGeocodableLocation(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const t = raw.trim();
  if (t.length < 2) return false;
  if (/^not specified$/i.test(t)) return false;
  if (/^n\/a$/i.test(t)) return false;
  if (/^unknown$/i.test(t)) return false;
  if (t === ',') return false;
  return true;
}

export type AlumniRepairBatchResult = {
  distinctProcessed: number;
  rowsUpdated: number;
  skippedNoResult: number;
  errors: string[];
};

/**
 * Service-role repair: set `current_place` only, keyed by distinct `location` text
 * among rows where `current_place` is null.
 */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runAlumniCurrentPlaceRepairBatch(
  supabase: SupabaseClient,
  mapboxToken: string,
  options?: { dryRun?: boolean; delayMsBetweenDistinct?: number }
): Promise<AlumniRepairBatchResult> {
  const dryRun = options?.dryRun ?? false;
  const delayMs = options?.delayMsBetweenDistinct ?? 0;
  const errors: string[] = [];
  let rowsUpdated = 0;
  let skippedNoResult = 0;

  type Row = { id: string; location: string | null };
  const rows: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('alumni')
      .select('id, location')
      .is('current_place', null)
      .range(from, from + PAGE - 1);

    if (error) {
      errors.push(error.message);
      return { distinctProcessed: 0, rowsUpdated: 0, skippedNoResult: 0, errors };
    }
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  const byKey = new Map<string, { query: string; ids: string[] }>();
  for (const r of rows) {
    if (!isGeocodableLocation(r.location)) continue;
    const query = r.location!.trim();
    const key = query.toLowerCase();
    const cur = byKey.get(key);
    if (cur) cur.ids.push(r.id);
    else byKey.set(key, { query, ids: [r.id] });
  }

  const entries = [...byKey.entries()].slice(0, MAX_DISTINCT);
  let distinctProcessed = 0;

  for (const [, { query, ids }] of entries) {
    distinctProcessed += 1;
    const place = await resolvePlaceFromLocationTextForStorage(query, mapboxToken);
    if (!place) {
      skippedNoResult += 1;
      if (delayMs > 0) await sleep(delayMs);
      continue;
    }
    if (dryRun) {
      rowsUpdated += ids.length;
    } else {
      const { error } = await supabase
        .from('alumni')
        .update({
          current_place: place,
          work_state_code: deriveWorkStateCodeFromCanonicalPlace(place),
        })
        .in('id', ids);
      if (error) {
        errors.push(`${query}: ${error.message}`);
      } else {
        rowsUpdated += ids.length;
      }
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  return { distinctProcessed, rowsUpdated, skippedNoResult, errors };
}
