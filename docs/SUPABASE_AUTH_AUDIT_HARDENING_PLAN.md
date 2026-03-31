# Supabase Auth Audit & Hardening Plan (Next.js App Router)

Date: 2026-03-28

> Scope note: Per your instruction (`DO NOT UPDATE CODE`), this deliverable is a comprehensive audit + concrete hardening implementation plan. No runtime code paths were modified in this pass.

## Executive root-cause summary

Your intermittent sign-outs, 429s, and refresh/session instability are consistent with **auth-call amplification + duplicated auth validation paths**:

1. **Middleware calls `auth.getSession()` on essentially every request** (including most app/API traffic), which can trigger frequent token checks/refresh behavior. In development, rapid route changes + HMR can multiply this quickly.
2. **Client components repeatedly call `auth.getSession()` per action** (e.g., invitations, user posts) instead of reusing a single in-memory auth state, creating avoidable auth chatter.
3. **Many route handlers have dual-path auth logic** (`Bearer token` path + cookie `createServerClient(...).auth.getUser()` fallback), often resulting in redundant `getUser` calls in the same request flow.
4. **Auth context initialization + listener setup can overlap with component-level `getSession` calls**, creating race windows where multiple paths try to validate/refresh around the same time.
5. **No centralized request-scoped auth helper** currently enforces one-and-only-one identity resolution per request, so every route repeats custom logic.

Net result: under heavy dev workflow, these patterns can exceed Supabase auth endpoint limits and increase refresh token reuse/race risk.

---

## Audit inventory: all auth/session/user API call sites

Legend:
- **Method**: Supabase auth/session/client method observed.
- **Risk**:
  - `HIGH`: likely source of repeated auth endpoint traffic or refresh races.
  - `MEDIUM`: repeated auth checks in same request class / duplicated path logic.
  - `LOW`: expected/one-time auth operation (signin/signup/callback), but still noted.

| File | Function / Component | Method | Risk | Why risky / redundant | Recommended fix |
|---|---|---|---|---|---|
| `middleware.ts` | `middleware` | `createServerClient` + `auth.getSession` | **HIGH** | Runs broadly across requests; can cause auth endpoint churn and background refresh pressure. | Remove unconditional `getSession` from middleware. Only perform auth checks in middleware for strictly protected route groups, and prefer lightweight cookie presence gate there. |
| `lib/supabase/auth-context.tsx` | `initializeAuth` | `auth.getSession` | **MEDIUM** | Good as bootstrapping call, but overlaps with other component `getSession` calls. | Keep single bootstrap call; all client consumers should use context state instead of calling `getSession` directly. |
| `lib/supabase/auth-context.tsx` | provider effect | `onAuthStateChange` | **LOW/MEDIUM** | Correct listener pattern, but can duplicate downstream work if many components also do direct session calls. | Keep listener; remove direct session polling elsewhere. |
| `components/features/invitations/InviteManagement.tsx` | `fetchInvitations`, `handleCreateInvitation`, `handleUpdateInvitation`, `handleDeleteInvitation` | `auth.getSession` (4x) | **HIGH** | Each UI action re-queries session/token. Burst actions create auth spikes. | Read token once from auth context (`session?.access_token`) and reuse; fail fast if missing. |
| `lib/hooks/useUserPosts.ts` | `fetchUserPosts`, `deletePost` | `auth.getSession` (2x) | **HIGH** | Per-hook operation auth lookups duplicate provider state. | Replace with `useAuth().session` dependency. |
| `app/onboarding/prefill-profile/page.tsx` | `handleOptionSelect` | `auth.getSession` | **MEDIUM** | Action-level token retrieval likely redundant with global auth context. | Consume context session. |
| `components/features/dashboard/dashboards/ui/MobileAdminTasksPage.tsx` | `loadDocuments` | `auth.getUser` | **MEDIUM** | Client-side user identity fetch can duplicate context user data. | Use `useAuth().user` where available. |
| `app/dashboard/page.tsx` | page function | `createServerClient` + `auth.getUser` | **LOW** | Valid server-side check for SSR route, but should be canonical and reused consistently. | Keep pattern; move into shared server helper (`getRequestUser`) used by all server pages/routes. |
| `app/(auth)/auth/callback/route.ts` | `GET` | `createServerClient` | **LOW** | Expected for PKCE exchange. | Keep as-is, ensure only callback route exchanges code. |
| `app/(auth)/sign-in/[[...sign-in]]/page.tsx` | `handleSubmit` | `auth.getUser` | **LOW/MEDIUM** | Post-signin verification can be fine, but watch for extra round-trips after signIn response already includes user/session. | Use response from signIn call when possible. |
| `app/api/tasks/route.ts` | `GET`, `POST` | `createServerClient` + `auth.getUser` | **MEDIUM** | Repeated boilerplate across methods; risk of divergent behavior. | Centralize in auth utility and call once/request. |
| `app/api/dues/assignments/route.ts` | `createApiSupabaseClient`, `GET/POST/PATCH/DELETE` | `createServerClient` + `auth.getUser` (many) | **MEDIUM** | Multiple method handlers, repeated identity checks. | Helper that returns `{user, supabase}` once per request. |
| `app/api/dues/cycles/route.ts` | `GET` | `auth.getUser` | **MEDIUM** | Standard but duplicated project-wide. | Use shared request auth helper. |
| `app/api/profile/public/[slug]/route.ts` | `GET` | `createServerClient` + `auth.getUser` | **MEDIUM** | Public route doing auth lookup can be optional; likely only needed for viewer-specific fields. | Make auth optional with one helper call; avoid fallback duplicate checks. |
| `app/api/profile/similar/[slug]/route.ts` | `GET` | `createServerClient` + `auth.getUser` | **MEDIUM** | Similar to above. | Same helper strategy. |
| `app/api/alumni/route.ts` | `GET` | `auth.getUser` token path + `createServerClient` + `auth.getUser` fallback | **HIGH** | Dual-path lookup can produce duplicated calls and inconsistent user resolution. | Replace with one canonical resolver: prefer Bearer token if present else cookie client; never both. |
| `app/api/chapter/members/route.ts` | `GET` | same dual pattern | **HIGH** | Same duplicated auth checks. | Same canonical resolver. |
| `app/api/vendors/bulk-import/route.ts` | `authenticateRequest` | token `auth.getUser` + cookie `auth.getUser` | **HIGH** | Fallback pattern repeated; duplicate auth endpoint traffic. | Consolidate resolver; single auth call/request. |
| `app/api/recruitment/recruits/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/recruitment/recruits/[id]/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/recruitment/recruits/bulk-import/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/events/[id]/attendance/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/events/[id]/check-in/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/events/[id]/check-in-qr/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/chapters/[id]/check-in-qr/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/chapters/[id]/features/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/branding/upload-logo/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/branding/chapters/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/branding/chapters/[chapterId]/route.ts` | `authenticateRequest` | token + cookie auth branches | **HIGH** | Same issue. | Consolidate resolver. |
| `app/api/developer/*` auth routes | `authenticateRequest` | token + cookie auth branches | **MEDIUM/HIGH** | Repeated dual checks even for internal/dev endpoints. | Reuse same resolver; optionally disable in prod via env guard. |
| `app/api/posts*`, `app/api/comments*`, `app/api/invitations*`, `app/api/profile-import*`, `app/api/messages/route.ts`, `app/api/chapter/budget/route.ts`, `app/api/sms/send/route.ts`, `app/api/me/governance-chapters/route.ts`, `app/api/announcements*`, `app/api/events/recipient-counts/route.ts` | respective handlers | `auth.getUser(token)` | **MEDIUM** | Individually fine, but many bespoke implementations increase divergence and maintenance risk. | Standardize to one helper and identical error mapping / telemetry. |
| `lib/services/profileService.ts` | service methods | `auth.getUser` (multiple) | **MEDIUM** | Service-level user checks can duplicate higher-level auth checks. | Accept caller-provided user ID where possible; only fetch user once per request. |
| `lib/services/documentUploadService.ts` | methods | `auth.getUser` (multiple) | **MEDIUM** | Same repeated identity lookups. | Inject resolved user/userId from caller. |
| `lib/services/linkedinInImportService.ts` | methods | `auth.getUser` (multiple) | **MEDIUM** | Same repeated identity lookups. | Inject resolved user/userId from caller. |
| `lib/supabase/client.ts` | module scope | `createBrowserClient` | **LOW** | Correct singleton browser client creation. | Keep. |

---

## Problematic files (priority list)

### Priority 0 (largest likely auth chatter / race contributors)
- `middleware.ts`
- `lib/supabase/auth-context.tsx`
- `components/features/invitations/InviteManagement.tsx`
- `lib/hooks/useUserPosts.ts`
- `app/api/*/route.ts` files that do token+cookie dual auth fallback in same helper (`authenticateRequest` pattern)

### Priority 1 (cleanup for consistency + reduced divergence)
- All route handlers with inline `auth.getUser(token)` boilerplate.
- Client/service helpers doing repeated `auth.getUser` when caller already knows user.

---

## Proposed target architecture (before implementation)

### 1) One request-scoped server auth resolver
Create a single helper (example: `lib/supabase/request-auth.ts`) used by all route handlers and server components:

- Inputs: `NextRequest` (or headers/cookies abstraction).
- Behavior:
  1. If `Authorization: Bearer ...` exists, validate **once** via anon client `auth.getUser(token)`.
  2. Else create cookie `createServerClient` and call `auth.getUser()` **once**.
  3. Return normalized `{ user, source: 'bearer' | 'cookie', error? }`.
- Rule: never execute both paths for same request.

### 2) Middleware becomes minimal / no auth refresh engine
- Remove unconditional `auth.getSession()` call.
- Middleware only:
  - skip static/webhook routes (already present),
  - optionally redirect truly protected page groups based on cookie presence (cheap check),
  - never do eager session refresh on every request.

### 3) Client auth source-of-truth = AuthContext
- `AuthProvider` does one startup `getSession` + `onAuthStateChange` listener.
- All client components/hooks must read `session` and `user` from context, not call `supabase.auth.getSession/getUser` repeatedly.
- Add a tiny utility/hook (`useAccessToken`) that returns `session?.access_token` and memoizes per render.

### 4) API caller normalization from client
- For fetch calls from client, use one shared helper to attach bearer token from context.
- Avoid every component independently doing: `await supabase.auth.getSession(); fetch(...)`.

### 5) Service layer contracts
- Services that need user identity should accept `userId` / `user` as parameter.
- Identity resolved once at boundary (route handler/context), then passed downward.

### 6) Race hardening + observability
- Add lightweight logging counters for auth resolver invocations by source + route.
- Add explicit guard comments: “Do not call both bearer and cookie auth in the same request.”
- (Optional) add in-memory per-request promise memoization when multiple sub-functions may need user in same handler.

---

## Concrete implementation plan (safe, targeted)

1. **Create shared helper**
   - `getRequestUser(req)` + optional `requireRequestUser(req)` wrappers.
2. **Refactor dual-path `authenticateRequest` route files first**
   - Replace duplicated token+cookie fallback logic with helper call.
3. **Refactor middleware**
   - Remove broad `getSession` call.
4. **Refactor client hotspots**
   - `InviteManagement` + `useUserPosts` + onboarding/session reads to `useAuth` session.
5. **Refactor service methods**
   - Pass resolved user/userId into methods that currently call `auth.getUser` internally.
6. **Add regression checklist + smoke tests**
   - login/logout, page refresh, rapid navigation, multi-tab behavior, burst API actions.

---

## Validation & testing checklist (post-refactor)

### Functional
- [ ] Sign in/out works on fresh browser profile.
- [ ] OAuth callback path still sets session correctly.
- [ ] Protected routes redirect correctly when unauthenticated.
- [ ] Invitation CRUD works without new auth errors.
- [ ] User posts fetch/delete works without forced sign-outs.

### Stability / load-behavior
- [ ] Rapid route switching (10–20 navigations) does not trigger 429 on auth endpoints.
- [ ] Burst clicking invitation actions does not call `auth.getSession` repeatedly.
- [ ] No “refresh token already used” / reuse-session warnings under normal dev interaction.

### Observability
- [ ] Compare auth endpoint request count before/after.
- [ ] Confirm middleware no longer triggers auth session checks on every request.

---

## Follow-up manual steps for your team

1. Implement the above in a short-lived branch with feature flag if needed.
2. Monitor Supabase Auth logs for 24–48h after deployment.
3. Re-check auth rate limit dashboard and verify trend drop.
4. Document “auth call rules” in your internal engineering guide.

---

## Raw call inventory (machine-generated)

This inventory was generated by repository-wide pattern scan for:
- `createServerClient`, `createBrowserClient`
- `auth.getUser`, `auth.getSession`, `auth.refreshSession`
- `onAuthStateChange`

```text
app/(auth)/auth/callback/route.ts:75|GET|createServerClient(
app/(auth)/sign-in/[[...sign-in]]/page.tsx:93|handleSubmit|auth.getUser(
app/api/alumni/route.ts:286|GET|auth.getUser(
app/api/alumni/route.ts:298|GET|createServerClient(
app/api/alumni/route.ts:312|GET|auth.getUser(
app/api/announcements/recipient-counts/route.ts:22|GET|auth.getUser(
app/api/announcements/route.ts:37|GET|auth.getUser(
app/api/announcements/route.ts:142|POST|auth.getUser(
app/api/auth/change-password/route.ts:24|POST|auth.getUser(
app/api/auth/reset-password/route.ts:24|POST|auth.getUser(
app/api/auth/validate-password/route.ts:23|POST|auth.getUser(
app/api/branding/chapters/[chapterId]/route.ts:23|authenticateRequest|auth.getUser(
app/api/branding/chapters/[chapterId]/route.ts:36|authenticateRequest|createServerClient(
app/api/branding/chapters/[chapterId]/route.ts:46|authenticateRequest|auth.getUser(
app/api/branding/chapters/route.ts:19|authenticateRequest|auth.getUser(
app/api/branding/chapters/route.ts:32|authenticateRequest|createServerClient(
app/api/branding/chapters/route.ts:42|authenticateRequest|auth.getUser(
app/api/branding/upload-logo/route.ts:21|authenticateRequest|auth.getUser(
app/api/branding/upload-logo/route.ts:34|authenticateRequest|createServerClient(
app/api/branding/upload-logo/route.ts:44|authenticateRequest|auth.getUser(
app/api/chapter/budget/route.ts:68|PATCH|auth.getUser(
app/api/chapter/members/route.ts:166|GET|auth.getUser(
app/api/chapter/members/route.ts:178|GET|createServerClient(
app/api/chapter/members/route.ts:192|GET|auth.getUser(
app/api/chapters/[id]/check-in-qr/route.ts:24|authenticateRequest|auth.getUser(
app/api/chapters/[id]/check-in-qr/route.ts:28|authenticateRequest|createServerClient(
app/api/chapters/[id]/check-in-qr/route.ts:40|authenticateRequest|auth.getUser(
app/api/chapters/[id]/features/route.ts:21|authenticateRequest|auth.getUser(
app/api/chapters/[id]/features/route.ts:35|authenticateRequest|createServerClient(
app/api/chapters/[id]/features/route.ts:45|authenticateRequest|auth.getUser(
app/api/developer/create-user/route.ts:16|authenticateRequest|auth.getUser(
app/api/developer/create-user/route.ts:27|authenticateRequest|createServerClient(
app/api/developer/create-user/route.ts:36|authenticateRequest|auth.getUser(
app/api/developer/notifications/test-email/route.ts:20|authenticateRequest|auth.getUser(
app/api/developer/notifications/test-email/route.ts:31|authenticateRequest|createServerClient(
app/api/developer/notifications/test-email/route.ts:44|authenticateRequest|auth.getUser(
app/api/developer/notifications/test-push/route.ts:22|authenticateRequest|auth.getUser(
app/api/developer/notifications/test-push/route.ts:33|authenticateRequest|createServerClient(
app/api/developer/notifications/test-push/route.ts:46|authenticateRequest|auth.getUser(
app/api/developer/notifications/test-sms/route.ts:20|authenticateRequest|auth.getUser(
app/api/developer/notifications/test-sms/route.ts:31|authenticateRequest|createServerClient(
app/api/developer/notifications/test-sms/route.ts:44|authenticateRequest|auth.getUser(
app/api/developer/users/route.ts:16|authenticateRequest|auth.getUser(
app/api/developer/users/route.ts:27|authenticateRequest|createServerClient(
app/api/developer/users/route.ts:36|authenticateRequest|auth.getUser(
app/api/dues/assignments/route.ts:8|createApiSupabaseClient|createServerClient(
app/api/dues/assignments/route.ts:32|GET|auth.getUser(
app/api/dues/assignments/route.ts:111|POST|auth.getUser(
app/api/dues/assignments/route.ts:211|PATCH|auth.getUser(
app/api/dues/assignments/route.ts:390|DELETE|auth.getUser(
app/api/dues/cycles/route.ts:13|GET|auth.getUser(
app/api/events/[id]/attendance/route.ts:17|authenticateRequest|auth.getUser(
app/api/events/[id]/attendance/route.ts:21|authenticateRequest|createServerClient(
app/api/events/[id]/attendance/route.ts:30|authenticateRequest|auth.getUser(
app/api/events/[id]/check-in-qr/route.ts:34|authenticateRequest|auth.getUser(
app/api/events/[id]/check-in-qr/route.ts:38|authenticateRequest|createServerClient(
app/api/events/[id]/check-in-qr/route.ts:50|authenticateRequest|auth.getUser(
app/api/events/[id]/check-in/route.ts:36|authenticateRequest|auth.getUser(
app/api/events/[id]/check-in/route.ts:40|authenticateRequest|createServerClient(
app/api/events/[id]/check-in/route.ts:49|authenticateRequest|auth.getUser(
app/api/events/recipient-counts/route.ts:22|GET|auth.getUser(
app/api/invitations/[id]/route.ts:26|PUT|auth.getUser(
app/api/invitations/[id]/route.ts:141|DELETE|auth.getUser(
app/api/invitations/route.ts:20|GET|auth.getUser(
app/api/invitations/route.ts:110|POST|auth.getUser(
app/api/me/governance-chapters/route.ts:17|GET|auth.getUser(
app/api/messages/route.ts:107|POST|auth.getUser(
app/api/notifications/push-subscription/route.ts:11|getAuthUser|auth.getUser(
app/api/posts/[id]/bookmark/route.ts:29|GET|auth.getUser(
app/api/posts/[id]/bookmark/route.ts:99|POST|auth.getUser(
app/api/posts/[id]/comments/[commentId]/like/route.ts:26|POST|auth.getUser(
app/api/posts/[id]/comments/[commentId]/route.ts:26|DELETE|auth.getUser(
app/api/posts/[id]/comments/route.ts:36|GET|auth.getUser(
app/api/posts/[id]/comments/route.ts:163|POST|auth.getUser(
app/api/posts/[id]/image/route.ts:31|GET|auth.getUser(
app/api/posts/[id]/like/route.ts:26|POST|auth.getUser(
app/api/posts/[id]/report/route.ts:29|POST|auth.getUser(
app/api/posts/[id]/route.ts:31|GET|auth.getUser(
app/api/posts/[id]/route.ts:151|DELETE|auth.getUser(
app/api/posts/[id]/route.ts:216|PATCH|auth.getUser(
app/api/posts/route.ts:50|GET|auth.getUser(
app/api/posts/route.ts:229|POST|auth.getUser(
app/api/profile-import/apply/route.ts:30|POST|auth.getUser(
app/api/profile-import/extract/route.ts:21|POST|auth.getUser(
app/api/profile-import/parse/route.ts:31|POST|auth.getUser(
app/api/profile-import/skip/route.ts:25|POST|auth.getUser(
app/api/profile-import/upload/route.ts:25|POST|auth.getUser(
app/api/profile/public/[slug]/route.ts:33|GET|createServerClient(
app/api/profile/public/[slug]/route.ts:47|GET|auth.getUser(
app/api/profile/route.ts:16|GET|auth.getUser(
app/api/profile/route.ts:51|PUT|auth.getUser(
app/api/profile/similar/[slug]/route.ts:34|GET|createServerClient(
app/api/profile/similar/[slug]/route.ts:48|GET|auth.getUser(
app/api/recruitment/recruits/[id]/route.ts:35|authenticateRequest|auth.getUser(
app/api/recruitment/recruits/[id]/route.ts:54|authenticateRequest|createServerClient(
app/api/recruitment/recruits/[id]/route.ts:64|authenticateRequest|auth.getUser(
app/api/recruitment/recruits/bulk-import/route.ts:37|authenticateRequest|auth.getUser(
app/api/recruitment/recruits/bulk-import/route.ts:55|authenticateRequest|createServerClient(
app/api/recruitment/recruits/bulk-import/route.ts:65|authenticateRequest|auth.getUser(
app/api/recruitment/recruits/route.ts:33|authenticateRequest|auth.getUser(
app/api/recruitment/recruits/route.ts:52|authenticateRequest|createServerClient(
app/api/recruitment/recruits/route.ts:62|authenticateRequest|auth.getUser(
app/api/sms/send/route.ts:30|POST|auth.getUser(
app/api/tasks/[id]/route.ts:22|PATCH|auth.getUser(
app/api/tasks/[id]/route.ts:69|DELETE|auth.getUser(
app/api/tasks/route.ts:11|GET|createServerClient(
app/api/tasks/route.ts:26|GET|auth.getUser(
app/api/tasks/route.ts:72|POST|createServerClient(
app/api/tasks/route.ts:91|POST|auth.getUser(
app/api/vendors/bulk-import/route.ts:26|createSupabaseFromCookies|createServerClient(
app/api/vendors/bulk-import/route.ts:48|authenticateRequest|auth.getUser(
app/api/vendors/bulk-import/route.ts:66|authenticateRequest|auth.getUser(
app/dashboard/page.tsx:37|hasDataUrl|createServerClient(
app/dashboard/page.tsx:57|hasDataUrl|auth.getUser(
app/onboarding/prefill-profile/page.tsx:68|handleOptionSelect|auth.getSession(
components/features/dashboard/dashboards/ui/MobileAdminTasksPage.tsx:339|loadDocuments|auth.getUser(
components/features/invitations/InviteManagement.tsx:31|fetchInvitations|auth.getSession(
components/features/invitations/InviteManagement.tsx:67|handleCreateInvitation|auth.getSession(
components/features/invitations/InviteManagement.tsx:105|handleUpdateInvitation|auth.getSession(
components/features/invitations/InviteManagement.tsx:144|handleDeleteInvitation|auth.getSession(
lib/hooks/useUserPosts.ts:25|fetchUserPosts|auth.getSession(
lib/hooks/useUserPosts.ts:142|deletePost|auth.getSession(
lib/services/documentUploadService.ts:48|(module scope)|auth.getUser(
lib/services/documentUploadService.ts:230|(module scope)|auth.getUser(
lib/services/linkedinInImportService.ts:59|(module scope)|auth.getUser(
lib/services/linkedinInImportService.ts:347|(module scope)|auth.getUser(
lib/services/profileService.ts:11|(module scope)|auth.getUser(
lib/services/profileService.ts:44|(module scope)|auth.getUser(
lib/services/profileService.ts:139|(module scope)|auth.getUser(
lib/supabase/auth-context.tsx:108|initializeAuth|auth.getSession(
lib/supabase/auth-context.tsx:130|initializeAuth|onAuthStateChange(
lib/supabase/client.ts:11|(module scope)|createBrowserClient(
middleware.ts:20|middleware|createServerClient(
middleware.ts:41|middleware|auth.getSession(
```
