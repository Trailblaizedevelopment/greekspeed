# Governance Role Audit

## Executive summary
Yes — the **`governance`** system role is implemented in this codebase.

At a high level, governance users:
- have a dedicated system role (`governance`),
- can access admin-style dashboards,
- can switch between a controlled set of chapters,
- are authorized on many APIs only for chapters they manage.

Managed chapters come from:
1. the `governance_chapters` table,
2. plus the governance user's own `profiles.chapter_id` as a fallback/home chapter.

---

## What the governance role is for (point of the role)
The role is designed for **cross-chapter operators** who need admin-like capabilities across multiple assigned chapters, without giving full developer privileges.

In code, governance users are treated similarly to admins for dashboard access, but their effective scope is chapter-limited by managed chapter IDs.

---

## Where governance is implemented

### 1) Role type definition
- `governance` is a first-class system role in profile types:
  - `types/profile.d.ts` (`SystemRole` includes `'governance'`).

### 2) Managed chapter resolution
- `lib/services/governanceService.ts` implements `getManagedChapterIds()`.
- Behavior:
  - returns empty list for non-governance users,
  - loads rows from `governance_chapters`,
  - appends home chapter (`profiles.chapter_id`) if missing.

### 3) Frontend chapter switching UX
- `components/features/dashboard/ChapterSwitcher.tsx` shows switcher for developer OR governance users.
- Governance chapter list is fetched from `/api/me/governance-chapters`.

### 4) Governance chapter API
- `app/api/me/governance-chapters/route.ts`:
  - authenticates caller,
  - verifies role is governance,
  - returns only managed chapters.

### 5) Dashboard behavior
- `app/dashboard/DashboardLayoutClient.tsx`: governance users default active chapter to their home chapter.
- `components/features/dashboard/DashboardOverview.tsx`: governance role routes to admin overview with effective chapter context.
- `app/dashboard/admin/page.tsx`: admin area allows roles `admin` and `governance`.

### 6) Permission utility support
- `lib/permissions.ts` includes chapter-context permission functions that explicitly support governance with managed chapter IDs:
  - `canManageChapterForContext(...)`
  - `canManageMembersForContext(...)`

### 7) API surface using governance scoping
Multiple APIs import `getManagedChapterIds` and apply governance-specific chapter checks (examples):
- `app/api/tasks/route.ts`
- `app/api/posts/route.ts`
- `app/api/invitations/route.ts`
- `app/api/chapter/budget/route.ts`
- `app/api/dues/cycles/route.ts`
- `app/api/dues/assignments/route.ts`
- `app/api/chapters/[id]/features/route.ts`
- `app/api/branding/chapters/[chapterId]/route.ts`
- `app/api/recruitment/recruits/route.ts`

---

## Where/how to set up governance users

## Option A — Developer APIs (recommended in app flow)
Governance assignment is controlled by developer-only API paths:

### Create new governance user
- `app/api/developer/create-user/route.ts`
- Accepts role `governance` and optional `governance_chapter_ids`.
- Inserts `governance_chapters` rows when role is governance.
- Explicitly blocks non-developers from assigning governance role.

### Update existing user to governance
- `app/api/developer/users/route.ts`
- On update, supports role changes including governance.
- Syncs `governance_chapters` (delete existing + insert submitted list).
- Explicitly blocks non-developers from assigning governance role/chapter IDs.

## Option B — Direct SQL assignment
- `scripts/governance-assign-chapters.sql` provides a manual SQL helper to assign chapter IDs to a governance user in `governance_chapters`.

---

## How governance works end-to-end
1. User profile role is set to `governance`.
2. Managed chapters are stored in `governance_chapters` (plus home chapter fallback).
3. On dashboard load, governance user gets an active chapter context.
4. Chapter switcher allows selecting among only managed chapters.
5. API routes check governance scope before allowing chapter-specific operations.

Result: governance can operate across assigned chapters while still being bounded by chapter-level scope.

---

## Gaps / risks found in this audit
1. **Schema visibility gap in repo:**
   - This repository includes a SQL helper script for `governance_chapters`, but I did not find a migration here that creates that table.
   - Risk: fresh environments may fail if DB schema is provisioned elsewhere and not tracked in this repo.

2. **Operational setup dependency:**
   - Governance behavior depends on `governance_chapters` data quality.
   - If a governance user has no rows and no home chapter, access becomes effectively empty.

---

## Suggested operational checklist
1. Confirm `profiles.role = 'governance'` for intended user.
2. Confirm `governance_chapters` rows exist for required chapters.
3. Confirm `profiles.chapter_id` is set to intended default/home chapter.
4. Verify `/api/me/governance-chapters` returns expected chapter IDs.
5. Validate chapter-scoped actions (tasks/posts/invitations/dues/branding/features) in at least one managed and one unmanaged chapter.

