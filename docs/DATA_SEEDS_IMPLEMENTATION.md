# Data seeds from Owen emails — implementation guide

This document describes the **generated artifacts**, how they map to Supabase tables, and a practical path to integrate them into the Trailblaize / Greekspeed codebase without risking production data.

## Artifacts (`data/seeds/`)

| File | Source | Purpose |
|------|--------|---------|
| `schools_seed.csv` | PRIORITY email, school markdown tables | Candidate rows aligned with `public.schools` (+ traceability columns) |
| `national_organizations_seed.csv` | PRIORITY Sections 2A–2E + 6 | Candidate rows aligned with `public.national_organizations` |
| `space_type_taxonomy_reference.csv` | PRIORITY Section 7 | Reference labels for product taxonomy (not necessarily a 1:1 DB table) |
| `reference_spaces_simulation_seed.csv` | FINAL “500-person simulation” email | **Reference / naming / weighting data only** — **do not** bulk-insert into `public.spaces` as real tenants |
| `data_seeds_bundle.xlsx` | Same as above | ExcelJS workbook with one sheet per dataset for review and handoff |

Regenerate from local `.eml` paths:

```bash
npm run parse-seeds -- "path/to/PRIORITY....eml" "path/to/FINAL....eml"
```

Defaults in `scripts/parse-seed-emails.ts` point at the original Downloads filenames on Windows.

## Database column targets

### `public.schools`

Parser output columns: `name`, `short_name`, `location`, `domain`, `logo_url`, plus **import-only** fields:

- `source_subsection`, `source_conference`, `source_division`, `source_institution_type`

On import, either **drop** the `source_*` columns or land them in a staging table / JSON metadata column if you want provenance in-app.

### `public.national_organizations`

Output: `name`, `short_name`, `type`, `website_url`, `logo_url`, `source_section`.

- `type` values are **app enums** (e.g. `nic_fraternity`, `honor_society`). Confirm they match your latest `national_organizations.type` constraint before bulk load.
- Section 6 uses **`### 6A` / `### 6B`** to distinguish `professional_association` vs `honor_society`; bold subsection lines only update `source_section` trace text.

### Simulation “spaces”

`reference_spaces_simulation_seed.csv` is for **copy decks, search suggestions, analytics priors, or curated demo content** — not for creating thousands of real `spaces` rows tied to billing and RLS. If you need demo spaces, use a **small** controlled seed with explicit org IDs and a feature flag.

## Recommended import order

1. **Schools** — few hundred rows; fewest downstream dependencies if chapters/spaces reference `school_id`.
2. **National organizations** — required before chapter rows that reference `national_organization_id`.
3. **Taxonomy / reference CSVs** — product-specific; may be static JSON in the repo or a dedicated `reference_*` schema, not `public` tenants.

## Integration patterns (choose one)

### A. Staging + SQL merge (safest for production)

1. Create `staging.schools_seed`, `staging.national_orgs_seed` (wide columns including `source_*`).
2. `COPY` from CSV (Supabase SQL editor or `psql`).
3. `INSERT INTO public.schools (...) SELECT ... FROM staging...` with `WHERE NOT EXISTS` or `ON CONFLICT` on a natural key (`lower(trim(name))`, domain, etc.) **only after** you define a conflict target (add a unique index if missing).
4. Log counts and mismatches; never truncate production tables from a script.

### B. One-off Edge Function or admin-only route

- Authenticate as **service role** inside a Vercel cron or internal admin action.
- Read CSV from `storage` or bundle a trimmed JSON in the repo for environments that need fixtures.
- Use **idempotent** upserts with explicit batch sizes.

### C. Keep seeds in-repo as TypeScript modules

- For **small** lists (e.g. national org type labels), export `const PRIORITY_SCHOOLS = [...] as const` and migrate via a typed migration script.
- Poor fit for 2k+ simulation names; keep those in CSV.

## Codebase touchpoints (when you wire this in)

- **Onboarding / school pickers:** ensure combobox queries read `schools` with indexes on `name` / `domain` if you add domains later.
- **Chapter creation:** validate `national_organization_id` + `school_id` FKs before insert.
- **RLS:** seeding with service role bypasses RLS; app reads use `anon` / `authenticated` — confirm policies allow read of new rows where needed.
- **Types:** after schema changes, regenerate Supabase types (`Database` interface) so client code stays strict.

## QA checklist before any production import

- [ ] Row counts vs email sections (Big Ten split rows, Section 6 honor vs professional).
- [ ] No duplicate `name` keys where your unique constraints expect uniqueness.
- [ ] `type` enum values accepted by Postgres.
- [ ] UTF-8: subsection titles and em dashes in source emails decode correctly in CSV viewers.
- [ ] Rollback plan: migration down or backup snapshot.

## Next “project” steps (suggested ticket breakdown)

1. **Schema** — confirm unique keys for schools/orgs; add `seed_batch_id` or `source` column if you want traceability in `public` tables.
2. **Importer** — Node script or SQL-only path with dry-run mode (`LIMIT`, `BEGIN … ROLLBACK`).
3. **App** — wire pickers to prefer seeded schools; optional “suggest from simulation list” for marketing copy only.
4. **Ops** — document who runs imports and in which environments (staging first).

The parser is intentionally **read-only** with respect to Supabase; it only produces files under `data/seeds/`. All mutations remain in reviewed migrations or admin tools.
