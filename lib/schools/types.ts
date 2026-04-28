/** Unified row returned by GET /api/schools/search (local DB + OpenAlex preview). */
export type SchoolSearchHit = {
  id: string;
  name: string;
  short_name: string | null;
  location: string | null;
  domain: string | null;
  source: 'database' | 'openalex';
  /** Present when `source === 'openalex'`; use POST /api/schools/materialize to get a UUID. */
  openAlexId?: string;
};
