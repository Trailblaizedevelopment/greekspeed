/**
 * Backfill / repair: set `alumni.current_place` from Mapbox using `alumni.location`
 * for rows where `current_place` is null. Updates `current_place` and `work_state_code`.
 *
 * Uses shared batch logic with `npm run` and optional Vercel cron
 * (`/api/cron/alumni-current-place-repair`).
 *
 *   npx tsx scripts/backfill-alumni-current-place.ts
 *   npx tsx scripts/backfill-alumni-current-place.ts --dry-run
 *   npx tsx scripts/backfill-alumni-current-place.ts --loop   # run batches until empty / cap
 */

import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { runAlumniCurrentPlaceRepairBatch } from '@/lib/alumni/runAlumniCurrentPlaceRepairBatch';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapboxToken = process.env.MAPBOX_SECRET_ACCESS_TOKEN;

const DELAY_MS = 180;
const LOOP_MAX = 200;

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const loop = process.argv.includes('--loop');
  return { dryRun, loop };
}

async function main() {
  const { dryRun, loop } = parseArgs();

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!mapboxToken) {
    console.error('Missing MAPBOX_SECRET_ACCESS_TOKEN');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let totalRows = 0;
  let totalDistinct = 0;
  let totalSkip = 0;
  let iter = 0;

  do {
    iter += 1;
    const result = await runAlumniCurrentPlaceRepairBatch(supabase, mapboxToken, {
      dryRun,
      delayMsBetweenDistinct: DELAY_MS,
    });
    totalRows += result.rowsUpdated;
    totalDistinct += result.distinctProcessed;
    totalSkip += result.skippedNoResult;

    console.log(
      `[batch ${iter}] distinct=${result.distinctProcessed} rows=${result.rowsUpdated} noResult=${result.skippedNoResult} errors=${result.errors.length}`
    );
    if (result.errors.length) console.error(result.errors);

    if (!loop || result.distinctProcessed === 0 || iter >= LOOP_MAX) break;
  } while (loop);

  console.log('---');
  console.log(
    `Done (${iter} batch(es)). Rows ${dryRun ? 'would update' : 'updated'}: ${totalRows}; distinct queries: ${totalDistinct}; no-result: ${totalSkip}.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
