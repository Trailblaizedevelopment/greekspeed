import { createHash } from 'crypto';

const MAX_SLUG_LEN = 180;

/** Stable key for idempotent CSV re-import (source + category + raw name). */
export function simulationRowDedupeKey(source: string, category: string, rawName: string): string {
  const s = (source || '').trim();
  const c = (category || '').trim();
  const r = (rawName || '').trim();
  return `${s.toLowerCase()}\u001f${c.toLowerCase()}\u001f${r.toLowerCase()}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function shortStableHash(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 10);
}

export type SimulationSpaceInsert = {
  name: string;
  slug: string;
  national_fraternity: string;
  chapter_name: string;
  school: string;
  space_type: string | null;
  llm_data: Record<string, unknown> | null;
};

/**
 * Build a `public.spaces` insert payload from a simulation CSV row.
 * Ensures slug + composite (national_fraternity, chapter_name, school) uniqueness via suffixes.
 */
export function buildSimulationSpaceRow(params: {
  rawName: string;
  category: string;
  profileWeight: string;
  source: string;
  usedSlugs: Set<string>;
  usedNames: Set<string>;
  usedComposites: Set<string>;
}): SimulationSpaceInsert {
  const raw = params.rawName.trim();
  const cat = params.category.trim() || 'Uncategorized';
  const catSlug = slugify(cat) || 'uncategorized';
  const natFrat = catSlug.slice(0, 120);
  let chapterName = raw.slice(0, 240);
  const schoolBase = 'Simulation';

  const compositeKey = (nf: string, cn: string, sch: string) =>
    `${nf.toLowerCase()}::${cn.toLowerCase()}::${sch.toLowerCase()}`;

  let school = schoolBase;
  let name = raw;
  let slugBase = `${catSlug}_${slugify(raw)}`.replace(/_+/g, '_') || `row_${shortStableHash([raw, cat])}`;

  let slug = slugBase.slice(0, MAX_SLUG_LEN);
  let salt = 0;
  const bump = () => {
    salt++;
    const h = shortStableHash([raw, cat, String(salt)]);
    chapterName = `${raw.slice(0, 200)} · ${h}`.slice(0, 240);
    school = `${schoolBase}-${h.slice(0, 8)}`;
    name = raw.length > 220 ? `${raw.slice(0, 200)} · ${h.slice(0, 6)}` : `${raw} · ${h.slice(0, 6)}`;
    slugBase = `${catSlug}_${slugify(raw)}_${h}`.replace(/_+/g, '_');
    slug = slugBase.slice(0, MAX_SLUG_LEN);
  };

  while (
    params.usedSlugs.has(slug) ||
    params.usedNames.has(name.toLowerCase()) ||
    params.usedComposites.has(compositeKey(natFrat, chapterName, school))
  ) {
    bump();
  }

  params.usedSlugs.add(slug);
  params.usedNames.add(name.toLowerCase());
  params.usedComposites.add(compositeKey(natFrat, chapterName, school));

  const llm_data = {
    seed_source: params.source,
    seed_category: cat,
    seed_profile_weight: params.profileWeight,
    seed_raw_name: raw,
  };

  return {
    name,
    slug,
    national_fraternity: natFrat,
    chapter_name: chapterName,
    school,
    space_type: catSlug.slice(0, 120),
    llm_data,
  };
}
