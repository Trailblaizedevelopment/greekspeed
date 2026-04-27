# Data seeds from Owen emails — implementation guide

**Linear epic:** [TRA-665](https://linear.app/trailblaize/issue/TRA-665/epic-greekspeed-seed-data-import-normalize-bulk-spaces-verified) — Phase 1 decisions, FK order, mapping, and **icon user** behavior are recorded in the **issue comment** (2026-04-27).

**Developer-only (2026-04-27):** Space search and “ensure reference” APIs live under **`/api/developer/spaces/*`** and require **`profiles.is_developer`** + Bearer token. UI: **`/dashboard/developer/seed-spaces`**. They are **not** wired into member onboarding.

This document describes the **generated artifacts**, how they map to Supabase tables, and a practical path to integrate them into the Trailblaize / Greekspeed codebase without risking production data.

## Artifacts (`data/seeds/`)

| File | Source | Purpose |
|------|--------|---------|
| `schools_seed.csv` | PRIORITY email, school markdown tables | Candidate rows aligned with `public.schools` (+ traceability columns) |
| `national_organizations_seed.csv` | PRIORITY Sections 2A–2E + 6 | Candidate rows aligned with `public.national_organizations` |
| `space_type_taxonomy_reference.csv` | PRIORITY Section 7 | Reference labels for product taxonomy (not necessarily a 1:1 DB table) |
| `reference_spaces_simulation_seed.csv` | FINAL “500-person simulation” email | **Importer target for `public.spaces`** (full reference per TRA-665); validate on dev/staging first — see unique indexes on `spaces` (`name`, `slug`, composite) in Linear comment |
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

`reference_spaces_simulation_seed.csv` maps into **`public.spaces`** for the full reference catalog (TRA-665). Provenance fields (`profile_weight`, `source`, raw category) are stored in **`spaces.llm_data`** JSON. Slug / name / composite uniqueness is handled in **`lib/dataSeeds/spaceSeedMapping.ts`** and **`scripts/import-data-seeds.ts`**.

## Importer CLI (service role)

Script: **`scripts/import-data-seeds.ts`**

```bash
# Dry run (logs counts only)
npx tsx scripts/import-data-seeds.ts --dry-run

# Live import (requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
npx tsx scripts/import-data-seeds.ts --only=schools
npx tsx scripts/import-data-seeds.ts --only=orgs
npx tsx scripts/import-data-seeds.ts --only=spaces
npx tsx scripts/import-data-seeds.ts --only=all

# Cap simulation spaces while testing
npx tsx scripts/import-data-seeds.ts --only=spaces --spaces-limit=100
```

npm alias: **`npm run import-seeds`** (same args).

Order inside `--only=all`: **schools → national_organizations → spaces**. `source_*` / `source_section` columns are **not** inserted into public tables.

## Onboarding APIs (TRA-665)

| Route | Purpose |
|-------|--------|
| `GET /api/developer/spaces/search?q=…&limit=…` | **Developer only** (`profiles.is_developer` + Bearer). Search `spaces` by name/slug/school; returns icon / first-member fields. **Service role** join on server. |
| `POST /api/developer/spaces/ensure-reference` | **Developer only** — body `{ "name": string, "category"?: string }` — find by exact `name` or create simulation-style space; returns `{ space_id, created }`. |
| `POST /api/developer/spaces/assign-membership` | **Developer only** — body `{ "user_id": uuid, "space_id": uuid, "role"?: "active_member" \| "alumni", "is_primary"?: boolean }` — **`upsertSpaceMembership`** (not `profiles.role`). If **`is_primary: true`**, also **`syncProfileHomeFromPrimaryMembership`**: clears other primary memberships, sets **`profiles.chapter_id`** + **`chapter`**. Response includes **`home_space`** (previous/new labels or sync error). |

Shared helper: **`lib/services/spaceFromSimulationService.ts`** (`findOrCreateSpaceFromSimulationLabel`).

**Idempotent `import-seeds`:** second runs **skip** rows already present — schools by name/domain, national orgs by name, simulation spaces by **`llm_data`** seed key (`seed_source` + `seed_category` + `seed_raw_name`, see **`simulationRowDedupeKey`** in `lib/dataSeeds/spaceSeedMapping.ts`).

## Membership “icon user”

- DB: **`space_memberships.is_space_icon`** (migration `add_is_space_icon_to_space_memberships`).
- **`upsertSpaceMembership`**: on **new** insert, if there are no other active memberships for that space, sets **`is_space_icon: true`** unless `isSpaceIcon` is passed explicitly.

## RLS notes (verified)

- **`spaces`**: anon and authenticated **SELECT** allowed (onboarding discovery).
- **`space_memberships`**: users read **own** rows only — developer search API uses **service role** for cross-user icon joins.
- **`profiles`**: directory-style reads apply; only expose minimal fields in API responses.

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

The email **parser** (`scripts/parse-seed-emails.ts`) is read-only with respect to Supabase. **Bulk inserts** use `scripts/import-data-seeds.ts` + service role (or reviewed SQL).
