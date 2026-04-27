/**
 * TRA-665: Import CSV seeds into Supabase (service role).
 *
 * Idempotent: skips schools/orgs/spaces rows that already exist (by name/domain or simulation seed key).
 *
 * Usage:
 *   npx tsx scripts/import-data-seeds.ts [--dry-run] [--only=schools|orgs|spaces|all] [--spaces-limit=N]
 *
 * Requires `.env.local`: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseCsv, csvRowsToObjects } from '../lib/dataSeeds/parseSeedCsv';
import { buildSimulationSpaceRow, simulationRowDedupeKey } from '../lib/dataSeeds/spaceSeedMapping';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseArgs() {
  const argv = process.argv.slice(2);
  let dryRun = false;
  let only: 'schools' | 'orgs' | 'spaces' | 'all' = 'all';
  let spacesLimit: number | null = null;
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('--only=')) {
      const v = a.split('=')[1] as typeof only;
      if (v === 'schools' || v === 'orgs' || v === 'spaces' || v === 'all') only = v;
    } else if (a.startsWith('--spaces-limit=')) {
      spacesLimit = Math.max(0, parseInt(a.split('=')[1]!, 10) || 0);
    }
  }
  return { dryRun, only, spacesLimit };
}

async function loadSpaceUniquenessSets(supabase: ReturnType<typeof createClient>) {
  const usedSlugs = new Set<string>();
  const usedNames = new Set<string>();
  const usedComposites = new Set<string>();
  const compositeKey = (nf: string, cn: string, sch: string) =>
    `${nf.toLowerCase()}::${cn.toLowerCase()}::${sch.toLowerCase()}`;

  const pageSize = 2000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('spaces')
      .select('slug,name,national_fraternity,chapter_name,school')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.slug) usedSlugs.add(r.slug);
      if (r.name) usedNames.add(r.name.toLowerCase());
      if (r.national_fraternity && r.chapter_name && r.school) {
        usedComposites.add(compositeKey(r.national_fraternity, r.chapter_name, r.school));
      }
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { usedSlugs, usedNames, usedComposites };
}

async function loadExistingSimulationSeedKeys(supabase: ReturnType<typeof createClient>): Promise<Set<string>> {
  const keys = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('spaces')
      .select('llm_data')
      .not('llm_data', 'is', null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      const ld = r.llm_data as Record<string, unknown> | null;
      if (!ld || typeof ld !== 'object') continue;
      const raw = typeof ld.seed_raw_name === 'string' ? ld.seed_raw_name : '';
      if (!raw.trim()) continue;
      const cat = typeof ld.seed_category === 'string' ? ld.seed_category : '';
      const src = typeof ld.seed_source === 'string' ? ld.seed_source : '';
      keys.add(simulationRowDedupeKey(src, cat, raw));
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return keys;
}

async function loadExistingSchoolKeys(supabase: ReturnType<typeof createClient>) {
  const names = new Set<string>();
  const domains = new Set<string>();
  const pageSize = 2000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from('schools').select('name,domain').range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.name) names.add(r.name.toLowerCase().trim());
      const d = (r.domain ?? '').trim().toLowerCase();
      if (d) domains.add(d);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { names, domains };
}

async function loadExistingOrgNames(supabase: ReturnType<typeof createClient>) {
  const names = new Set<string>();
  const pageSize = 2000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from('national_organizations').select('name').range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.name) names.add(r.name.toLowerCase().trim());
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return names;
}

async function main() {
  const { dryRun, only, spacesLimit } = parseArgs();

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const seedsDir = path.join(process.cwd(), 'data', 'seeds');

  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'} | only=${only}${spacesLimit != null ? ` | spaces-limit=${spacesLimit}` : ''}`);

  if (only === 'schools' || only === 'all') {
    const fp = path.join(seedsDir, 'schools_seed.csv');
    const text = fs.readFileSync(fp, 'utf8');
    const rows = parseCsv(text);
    const headers = rows[0]!.map((h) => h.trim());
    const objects = csvRowsToObjects(headers, rows.slice(1));
    const seenName = new Set<string>();
    const candidates: { name: string; short_name: string | null; location: string | null; domain: string | null; logo_url: string | null }[] = [];
    for (const o of objects) {
      const name = (o.name ?? '').trim();
      if (!name || name === 'School Name') continue;
      const key = name.toLowerCase();
      if (seenName.has(key)) continue;
      seenName.add(key);
      candidates.push({
        name,
        short_name: (o.short_name ?? '').trim() || null,
        location: (o.location ?? '').trim() || null,
        domain: (o.domain ?? '').trim() || null,
        logo_url: (o.logo_url ?? '').trim() || null,
      });
    }

    const existing = await loadExistingSchoolKeys(supabase);
    const toInsert = candidates.filter((r) => {
      if (existing.names.has(r.name.toLowerCase())) return false;
      const d = (r.domain ?? '').trim().toLowerCase();
      if (d && existing.domains.has(d)) return false;
      return true;
    });
    const skipped = candidates.length - toInsert.length;
    console.log(
      `Schools: ${toInsert.length} to insert, ${skipped} skipped (already in DB)${dryRun ? ' [dry-run]' : ''} (source_* stripped)`
    );
    if (!dryRun) {
      const batch = 100;
      for (let i = 0; i < toInsert.length; i += batch) {
        const chunk = toInsert.slice(i, i + batch);
        const { error } = await supabase.from('schools').insert(chunk);
        if (error) {
          console.error(`Schools batch ${i}:`, error.message);
          for (const row of chunk) {
            const { error: e2 } = await supabase.from('schools').insert(row);
            if (e2) console.error(`  skip ${row.name}:`, e2.message);
          }
        }
      }
    }
  }

  if (only === 'orgs' || only === 'all') {
    const fp = path.join(seedsDir, 'national_organizations_seed.csv');
    const text = fs.readFileSync(fp, 'utf8');
    const rows = parseCsv(text);
    const headers = rows[0]!.map((h) => h.trim());
    const objects = csvRowsToObjects(headers, rows.slice(1));
    const seenName = new Set<string>();
    const candidates: {
      name: string;
      short_name: string | null;
      type: string | null;
      website_url: string | null;
      logo_url: string | null;
    }[] = [];
    for (const o of objects) {
      const name = (o.name ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seenName.has(key)) continue;
      seenName.add(key);
      candidates.push({
        name,
        short_name: (o.short_name ?? '').trim() || null,
        type: (o.type ?? '').trim() || null,
        website_url: (o.website_url ?? '').trim() || null,
        logo_url: (o.logo_url ?? '').trim() || null,
      });
    }

    const existingNames = await loadExistingOrgNames(supabase);
    const toInsert = candidates.filter((r) => !existingNames.has(r.name.toLowerCase()));
    const skipped = candidates.length - toInsert.length;
    console.log(
      `National orgs: ${toInsert.length} to insert, ${skipped} skipped (already in DB)${dryRun ? ' [dry-run]' : ''} (source_section stripped)`
    );
    if (!dryRun) {
      const batch = 100;
      for (let i = 0; i < toInsert.length; i += batch) {
        const chunk = toInsert.slice(i, i + batch);
        const { error } = await supabase.from('national_organizations').insert(chunk);
        if (error) {
          console.error(`Orgs batch ${i}:`, error.message);
          for (const row of chunk) {
            const { error: e2 } = await supabase.from('national_organizations').insert(row);
            if (e2) console.error(`  skip ${row.name}:`, e2.message);
          }
        }
      }
    }
  }

  if (only === 'spaces' || only === 'all') {
    const fp = path.join(seedsDir, 'reference_spaces_simulation_seed.csv');
    const text = fs.readFileSync(fp, 'utf8');
    const rows = parseCsv(text);
    const headers = rows[0]!.map((h) => h.trim());
    const objects = csvRowsToObjects(headers, rows.slice(1));
    const { usedSlugs, usedNames, usedComposites } = await loadSpaceUniquenessSets(supabase);
    const existingSeedKeys = await loadExistingSimulationSeedKeys(supabase);

    const payloads: ReturnType<typeof buildSimulationSpaceRow>[] = [];
    let skippedSeed = 0;
    let limit = spacesLimit != null ? spacesLimit : objects.length;
    for (let i = 0; i < objects.length && payloads.length < limit; i++) {
      const o = objects[i]!;
      const rawName = (o.raw_name ?? '').trim();
      if (!rawName) continue;
      const category = (o.category ?? '').trim();
      const source = (o.source ?? '').trim() || 'reference_spaces_simulation_seed.csv';
      const dedupeKey = simulationRowDedupeKey(source, category, rawName);
      if (existingSeedKeys.has(dedupeKey)) {
        skippedSeed++;
        continue;
      }
      existingSeedKeys.add(dedupeKey);
      payloads.push(
        buildSimulationSpaceRow({
          rawName,
          category,
          profileWeight: (o.profile_weight ?? '').trim(),
          source,
          usedSlugs,
          usedNames,
          usedComposites,
        })
      );
    }

    console.log(
      `Spaces (simulation): ${payloads.length} to insert, ${skippedSeed} skipped (same seed key already in DB)${dryRun ? ' [dry-run]' : ''}`
    );
    if (!dryRun) {
      const batchSize = 50;
      for (let i = 0; i < payloads.length; i += batchSize) {
        const chunk = payloads.slice(i, i + batchSize).map((p) => ({
          name: p.name,
          slug: p.slug,
          national_fraternity: p.national_fraternity,
          chapter_name: p.chapter_name,
          school: p.school,
          space_type: p.space_type,
          llm_data: p.llm_data,
        }));
        const { error } = await supabase.from('spaces').insert(chunk);
        if (error) {
          console.error(`Spaces batch ${i}:`, error.message);
          for (const row of chunk) {
            const { error: e2 } = await supabase.from('spaces').insert(row);
            if (e2) console.error(`  skip ${row.slug}:`, e2.message);
          }
        }
      }
    }
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
