# Public signup & directory onboarding — phased plan

This document tracks how we open the product to **self-serve users** (Handshake-style) while reusing **schools**, **national organizations**, and **chapters (spaces)**.

## Shipped in repo (current)

- **Schools:** Public `GET /api/schools/search` (local DB + OpenAlex education institutions). Authenticated `POST /api/schools/materialize` saves OpenAlex picks to `schools` (`openalex_id` dedupe). SQL: `docs/sql/schools_openalex_id.sql`.
- **National orgs:** Public `GET /api/national-organizations/search` over `national_organizations`.
- **Chapters API:** `GET /api/chapters` includes `school_id`, `national_organization_id`, `national_fraternity` for client-side filtering.
- **Onboarding:** Optional **School** and **National organization** typeaheads on **role-chapter** and **profile-basics** narrow the chapter dropdown (AND filters).
- **Developer create/edit space:** Directory fields use the same public search endpoints; OpenAlex school rows still require sign-in to materialize.
- **`.edu` signup:** Default remains **blocked** on self-serve paths. Set **`NEXT_PUBLIC_ALLOW_EDU_SIGNUP=true`** to allow campus emails everywhere `isEduEmailBlockedForSelfServeSignup` is used (sign-up, OAuth new user, invitation/chapter-join/alumni-invite accepts).

## How to test (devtools + UI)

1. **Schools search (no auth):** `GET /api/schools/search?q=tampa` — expect local + OpenAlex rows.
2. **Orgs search (no auth):** `GET /api/national-organizations/search?q=sigma&limit=10` — expect rows from `national_organizations`.
3. **Chapters payload:** `GET /api/chapters` — confirm objects include `national_organization_id` / `school_id` where set in DB.
4. **Onboarding:** Open role-chapter (directory unlocked). Pick school **and/or** org; chapter list should shrink. Clear filters resets list.
5. **Materialize:** Pick an OpenAlex-only school → Network `POST /api/schools/materialize` → row in `schools` with `openalex_id`.
6. **`.edu`:** With flag **unset**, sign-up with `@school.edu` should show the existing error. With **`NEXT_PUBLIC_ALLOW_EDU_SIGNUP=true`**, the same email should proceed (restart dev server after env change).

## Phase 2 (recommended next)

- **Profile persistence:** Store chosen `school_id` (and optionally `national_organization_id` affinity) on `profiles` when user selects directory rows—not only use them for filtering. Requires DB columns + PATCH `/api/me/profile` (or existing profile update) + types.
- **Chapter request UX:** After org/school selection, surface “Request to join” / pending state copy for spaces not yet listed (if product allows requests without a chapter row).

## Phase 3

- **User-created space requests:** Allow logged-in users to submit “Create my chapter” with school + national org + proposed name; admin queue (you already have membership request patterns to mirror).
- **Rate limits / abuse:** Public GET search should have stricter caching, IP limits, or edge middleware before wide launch.

## Phase 4

- **External org directory** (optional): If `national_organizations` is too thin, add a second source (curated CSV, partner API) merged like OpenAlex for schools.
- **Analytics:** Funnel events for directory usage → chapter selection → approval.

## Compliance

- OpenAlex: set **`OPENALEX_CONTACT_EMAIL`** (or rely on `SENDGRID_FROM_EMAIL`) for a polite `User-Agent`.
- **College / student data:** Document retention and purpose if you store school/org choices on profiles (Phase 2).
