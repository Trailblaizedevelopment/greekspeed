/**
 * One-shot: set `chapter_status` to `inactive` for simulation CSV seed spaces that are still `active`.
 *
 * Targets the same rows as `import-data-seeds.ts` (see `buildSimulationSpaceRow` / `isSimulationCsvSpaceRow`).
 *
 * Usage:
 *   npx tsx scripts/backfill-simulation-spaces-inactive.ts --dry-run
 *   npx tsx scripts/backfill-simulation-spaces-inactive.ts
 *
 * Requires `.env.local`: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import * as path from 'path';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSimulationCsvSpaceRow } from '../lib/dataSeeds/spaceSeedMapping';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SpaceRow = {
  id: string;
  chapter_status: string | null;
  llm_data: unknown;
  school: string | null;
  slug: string | null;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  return { dryRun: argv.includes('--dry-run') };
}

async function fetchActiveSpaces(supabase: SupabaseClient): Promise<SpaceRow[]> {
  const out: SpaceRow[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('spaces')
      .select('id,chapter_status,llm_data,school,slug')
      .eq('chapter_status', 'active')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as SpaceRow[];
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function main() {
  const { dryRun } = parseArgs();

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const activeRows = await fetchActiveSpaces(supabase);
  const targets = activeRows.filter((r) => isSimulationCsvSpaceRow(r));

  console.log(
    `Active spaces in DB: ${activeRows.length} | simulation seed rows to set inactive: ${targets.length} | mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`
  );

  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const sample = targets.slice(0, 5).map((r) => ({ id: r.id, slug: r.slug }));
  console.log('Sample:', JSON.stringify(sample, null, 2));

  if (dryRun) {
    console.log('Dry-run only — re-run without --dry-run to apply updates.');
    return;
  }

  const updatedAt = new Date().toISOString();
  const ids = targets.map((r) => r.id);
  const batchSize = 200;
  let ok = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { error } = await supabase
      .from('spaces')
      .update({ chapter_status: 'inactive', updated_at: updatedAt })
      .in('id', batch);
    if (error) {
      console.error(`Batch ${i / batchSize + 1} failed:`, error.message);
      process.exit(1);
    }
    ok += batch.length;
    console.log(`Updated ${ok}/${ids.length}`);
  }

  console.log('Done. Set chapter_status to inactive for simulation seed spaces.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
