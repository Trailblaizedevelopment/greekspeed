# Linear tickets: Sign in with Apple (Supabase OAuth)

**Created in Linear (via MCP):** Project and issues live on team [TRA / Trailblaize](https://linear.app/trailblaize/team/TRA/projects/all).

| Role | ID | Link |
|------|-----|------|
| **Project** | — | [Sign in with Apple (Supabase OAuth)](https://linear.app/trailblaize/project/sign-in-with-apple-supabase-oauth-42bf12f87f4e) |
| Epic (parent) | **TRA-629** | [Open](https://linear.app/trailblaize/issue/TRA-629) |
| Apple Developer registration | TRA-633 | [Open](https://linear.app/trailblaize/issue/TRA-633) |
| Supabase Apple provider (all envs) | TRA-634 | [Open](https://linear.app/trailblaize/issue/TRA-634) (blocked by TRA-633) |
| Sign-in + sign-up UI | TRA-635 | [Open](https://linear.app/trailblaize/issue/TRA-635) (blocked by TRA-634) |
| Invitation + alumni-join OAuth | TRA-636 | [Open](https://linear.app/trailblaize/issue/TRA-636) (blocked by TRA-634) |
| Chapter slug join OAuth | TRA-637 | [Open](https://linear.app/trailblaize/issue/TRA-637) (blocked by TRA-634) |
| AuthProvider `signInWithApple` | TRA-638 | [Open](https://linear.app/trailblaize/issue/TRA-638) (blocked by TRA-634) |
| Auth callback Apple profile logic | TRA-639 | [Open](https://linear.app/trailblaize/issue/TRA-639) (blocked by TRA-634) |
| QA cross-environment | TRA-640 | [Open](https://linear.app/trailblaize/issue/TRA-640) (blocked by TRA-635–639) |

Sub-issues **TRA-633–TRA-640** use **parent** [TRA-629](https://linear.app/trailblaize/issue/TRA-629).

## Project milestones

1. **M1 — Apple Developer & Supabase configuration** — TRA-633, TRA-634  
2. **M2 — Client OAuth entry points** — TRA-635, TRA-636, TRA-637, TRA-638  
3. **M3 — Auth callback & profile handling** — TRA-639  
4. **M4 — QA, redirects & production rollout** — TRA-640  

---

**How to use this doc:** Bodies in Linear match the structure in [`LINEAR_TICKET_TEMPLATE.md`](./LINEAR_TICKET_TEMPLATE.md). Use this file for copy edits or onboarding; the source of truth is Linear.

Suggested labels in Linear: `feature`; add `agent-ready` per ticket when acceptance criteria are finalized for automation.

---

## Epic (parent)

```
**Title:** Epic: Add Sign in with Apple for signup and signin via Supabase

**Description:** Deliver Sign in with Apple end-to-end using Supabase Auth OAuth, matching existing Google and LinkedIn patterns. Sub-issues cover Apple Developer setup, Supabase provider config, Next.js client flows, auth/callback profile logic, and QA across localhost, staging, and production.

**Acceptance criteria:**
- [ ] Apple appears as a first-class OAuth option wherever product requires parity with Google (minimum: sign-in, sign-up; join flows per sub-tickets)
- [ ] Supabase Apple provider configured for dev and prod projects with correct return URLs
- [ ] New users complete session and profile creation without regressions for Google/LinkedIn
- [ ] Manual QA checklist completed and noted in a comment on this epic (environments + dates)

**Files relating:** `app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `app/(auth)/sign-up/[[...sign-up]]/page.tsx`, `app/(auth)/auth/callback/route.ts`, `lib/supabase/auth-context.tsx`, `app/join/**`, `app/alumni-join/**`, `CLAUDE.md`
```

---

*Ticket bodies in Linear follow [`LINEAR_TICKET_TEMPLATE.md`](./LINEAR_TICKET_TEMPLATE.md).*
