/**
 * Institution search via OpenAlex (https://openalex.org) — no API key; polite pool expects a contact in User-Agent.
 * @see https://docs.openalex.org/api-entities/institutions/search-institutions
 */

import type { SchoolSearchHit } from '@/lib/schools/types';

const OPENALEX_BASE = 'https://api.openalex.org';

type OpenAlexGeo = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

export type OpenAlexInstitution = {
  id: string;
  display_name: string;
  display_name_acronyms?: string[] | null;
  type?: string | null;
  homepage_url?: string | null;
  geo?: OpenAlexGeo | null;
};

function openAlexUserAgent(): string {
  const mail =
    process.env.OPENALEX_CONTACT_EMAIL?.trim() ||
    process.env.SENDGRID_FROM_EMAIL?.trim() ||
    'dev@localhost';
  return `Greekspeed/1.0 (mailto:${mail})`;
}

export function openAlexShortIdFromUrl(institutionUrl: string): string | null {
  const tail = institutionUrl.split('/').pop()?.trim();
  if (!tail) return null;
  const m = tail.match(/^i(\d+)$/i);
  return m ? `I${m[1]}` : null;
}

export function formatOpenAlexLocation(geo: OpenAlexGeo | null | undefined): string | null {
  if (!geo) return null;
  const city = geo.city?.trim();
  const region = geo.region?.trim();
  const country = geo.country?.trim();
  if (city && region) return `${city}, ${region}`;
  if (city && country) return `${city}, ${country}`;
  return city || region || country || null;
}

export function domainFromHomepage(homepage: string | null | undefined): string | null {
  if (!homepage?.trim()) return null;
  const raw = homepage.includes('://') ? homepage.trim() : `https://${homepage.trim()}`;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

async function openAlexFetchJson<T>(pathWithQuery: string): Promise<T | null> {
  const url = pathWithQuery.startsWith('http') ? pathWithQuery : `${OPENALEX_BASE}${pathWithQuery}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': openAlexUserAgent(), Accept: 'application/json' },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type OpenAlexListResponse = {
  results?: OpenAlexInstitution[];
};

/**
 * Full-text institution search; restricts to `type:education` to match campuses / universities.
 */
export async function searchOpenAlexEducationInstitutions(
  q: string,
  perPage: number,
): Promise<SchoolSearchHit[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    search: trimmed,
    per_page: String(Math.min(50, Math.max(1, perPage))),
    filter: 'type:education',
  });

  const json = await openAlexFetchJson<OpenAlexListResponse>(`/institutions?${params.toString()}`);
  const rows = json?.results ?? [];

  const hits: SchoolSearchHit[] = [];
  for (const row of rows) {
    const openAlexId = openAlexShortIdFromUrl(row.id);
    if (!openAlexId) continue;
    const acronyms = row.display_name_acronyms ?? [];
    const short = acronyms[0]?.trim() || null;
    hits.push({
      id: `openalex:${openAlexId}`,
      name: row.display_name,
      short_name: short,
      location: formatOpenAlexLocation(row.geo ?? null),
      domain: domainFromHomepage(row.homepage_url),
      source: 'openalex',
      openAlexId,
    });
  }
  return hits;
}

export async function fetchOpenAlexInstitutionByShortId(
  shortId: string,
): Promise<OpenAlexInstitution | null> {
  const m = shortId.trim().match(/^i(\d+)$/i);
  if (!m) return null;
  const id = `I${m[1]}`;
  return openAlexFetchJson<OpenAlexInstitution>(`/institutions/${encodeURIComponent(id)}`);
}
