# Linear tickets: Announcement optional primary link

**Created in Linear (via MCP):** Parent and sub-issues live on team [TRA / Trailblaize](https://linear.app/trailblaize/team/TRA/active).

| Role | ID | Link |
|------|-----|------|
| Epic (parent) | **TRA-615** | [Open](https://linear.app/trailblaize/issue/TRA-615) |
| SendGrid email payload | TRA-616 | [Open](https://linear.app/trailblaize/issue/TRA-616) |
| Types + client | TRA-617 | [Open](https://linear.app/trailblaize/issue/TRA-617) |
| SMS CTA | TRA-618 | [Open](https://linear.app/trailblaize/issue/TRA-618) |
| Metadata verify | TRA-619 | [Open](https://linear.app/trailblaize/issue/TRA-619) |
| SendGrid template | TRA-620 | [Open](https://linear.app/trailblaize/issue/TRA-620) (blocked by TRA-616) |
| Push URL | TRA-621 | [Open](https://linear.app/trailblaize/issue/TRA-621) |
| Composer UI | TRA-622 | Done — see issue comments / commit `b8a7437` |
| Reader UI | TRA-623 | [Open](https://linear.app/trailblaize/issue/TRA-623) |
| QA | TRA-624 | [Open](https://linear.app/trailblaize/issue/TRA-624) |

Sub-issues **TRA-616–TRA-624** use **parent** [TRA-615](https://linear.app/trailblaize/issue/TRA-615).

---

**How to use this doc:** Bodies below match what was pasted into Linear (template from [`LINEAR_TICKET_TEMPLATE.md`](./LINEAR_TICKET_TEMPLATE.md)). Use for copy edits or if you recreate issues.

Follow structure from [`LINEAR_TICKET_TEMPLATE.md`](./LINEAR_TICKET_TEMPLATE.md): Title, Description, Acceptance criteria; optional Steps / Files / Screenshots where useful.

Suggested labels: `feature`, `agent-ready` (per ticket when AC is complete).

---

## Parent (Epic / umbrella)

```
**Title:** Add optional primary link to chapter announcements (SMS, email, push, in-app)

**Description:** Chapter announcements currently store body text only; links in the body are truncated or not tappable in SMS, and in-app views render plain text. We already persist an optional `metadata.primary_link` (`{ url, label? }`) validated in `sanitizeAnnouncementMetadataForCreate`. This epic finishes wiring that field through delivery channels (SMS CTA URL, email template, push URL) and all composer/reader UIs so execs can attach one HTTPS link per announcement with optional display label.

**Acceptance criteria:**
- [ ] Users can optionally set one primary link + label when composing an announcement everywhere announcements are created
- [ ] Primary link appears prominently in-app (drawer, card, mobile feed) when present
- [ ] SMS uses the primary URL as the tappable CTA when present; otherwise behavior matches today (in-app announcements URL)
- [ ] Email surfaces the link (template + dynamic data); CTA prioritizes primary link when set
- [ ] Push notification open URL uses primary link when set (product decision documented in sub-ticket)
- [ ] `npm run test:announcement-metadata` passes; manual QA checklist completed on staging

**Files relating:** `lib/validation/announcementMetadata.ts`, `app/api/announcements/route.ts`, `lib/services/emailService.ts`, `lib/services/notificationPushPayload.ts`, `components/features/dashboard/dashboards/ui/*`, `components/features/governance/GovernanceBroadcastHub.tsx`, `types/announcements.ts`, `lib/hooks/useAnnouncements.ts` (or equivalent create hook)
```

---

## Sub-ticket 1 — Metadata (mostly done; track verification)

```
**Title:** Verify announcement metadata.primary_link sanitization and reader helper

**Description:** `sanitizeAnnouncementMetadataForCreate` accepts optional `metadata.primary_link` (`https` URL, optional label) alongside `images`. `getPrimaryLinkFromMetadata` reads persisted metadata. This ticket confirms behavior, documents limits, and closes any gaps before other tickets depend on it.

**Acceptance criteria:**
- [ ] `npm run test:announcement-metadata` passes on `develop`
- [ ] API `POST /api/announcements` persists `metadata.primary_link` when client sends it (no extra server changes if body already forwards `metadata`)
- [ ] Invalid `http://`, whitespace-only label, or malformed `primary_link` returns 400 with clear error from existing sanitizer path

**Files relating:** `lib/validation/announcementMetadata.ts`, `scripts/test-announcement-metadata.ts`, `app/api/announcements/route.ts`

**Steps to reproduce (verification):**
1. Run `npm run test:announcement-metadata`
2. POST announcement with `metadata.primary_link: { "url": "https://example.com" }` and confirm row in DB / response includes sanitized metadata
```

---

## Sub-ticket 2 — Types and client create payload

```
**Title:** Extend announcement TypeScript types and create-announcement client for primary_link

**Description:** Ensure `CreateAnnouncementData`, hooks, and all call sites that build `metadata` include optional `primary_link` so the API receives the same shape the sanitizer expects. Prevents drift between UI and validation.

**Acceptance criteria:**
- [ ] `types/announcements.ts` (or equivalent) documents optional `metadata.primary_link` shape aligned with `AnnouncementPrimaryLink`
- [ ] `createAnnouncement` / mutation payload passes through `metadata` including `primary_link` without stripping unknown keys incorrectly (still only server-whitelisted keys are stored)
- [ ] Typecheck passes

**Files relating:** `types/announcements.ts`, `lib/hooks/useAnnouncements.ts`, any `createAnnouncement` fetch wrapper
```

---

## Sub-ticket 3 — SMS CTA uses primary link

```
**Title:** Use announcement primary link as SMS CTA URL when present

**Description:** Announcement SMS currently always uses `/dashboard/announcements` as the CTA URL and only shows a short text preview of body. When `getPrimaryLinkFromMetadata` returns a URL, use that URL for the CTA (and adjust CTA copy e.g. "Open link" vs "Read more") while preserving compliance formatting and segment limits.

**Acceptance criteria:**
- [ ] Member and alumni SMS paths in `app/api/announcements/route.ts` use primary link URL when metadata includes it; otherwise unchanged
- [ ] CTA label in SMS body remains clear; very long URLs may span multiple SMS segments — acceptable, document in ticket comment if needed
- [ ] Sandboxed / first-time vs returning recipient logic unchanged

**Files relating:** `app/api/announcements/route.ts`, `lib/validation/announcementMetadata.ts` (`getPrimaryLinkFromMetadata`), `lib/services/sms/smsMessageFormatter.ts`
```

---

## Sub-ticket 4 — Email dynamic data

```
**Title:** Pass announcement primary link fields into SendGrid announcement email payload

**Description:** Extend `EmailService.sendChapterAnnouncement` / `sendAnnouncementToChapter` dynamic template data with `has_primary_link`, `primary_link_url`, `primary_link_label`, and set main CTA `url`/`label` to primary link when present so templates can render a button block.

**Acceptance criteria:**
- [ ] When primary link exists, `dynamicTemplateData` includes boolean + url + optional label for SendGrid
- [ ] When absent, payload fields are false/empty and existing CTA behavior unchanged
- [ ] No secrets or PII in logs

**Files relating:** `lib/services/emailService.ts`, `app/api/announcements/route.ts` (call site if assembly moves)

**Steps to reproduce:**
1. Send test announcement with email flag on and `metadata.primary_link` set
2. Inspect SendGrid activity / received email after template update (sub-ticket 5)
```

---

## Sub-ticket 5 — SendGrid template (designer / marketing)

```
**Title:** Update SendGrid announcement dynamic template for primary link block

**Description:** Code will send new dynamic fields for optional primary link. The SendGrid dynamic template (ID from `SENDGRID_ANNOUNCEMENT_TEMPLATE_ID`) must conditionally show a prominent button or link line using Handlebars/SendGrid syntax consistent with existing `payload` structure.

**Acceptance criteria:**
- [ ] Template shows primary link section only when `has_primary_link` (or equivalent) is true
- [ ] Fallback plain URL text for clients that strip buttons
- [ ] Main CTA matches product choice: primary link vs dual CTA (primary + "Read in app") — document choice in issue
- [ ] Test send reviewed in Gmail + one mobile client

**Files relating:** SendGrid dashboard (not in repo); coordinate with sub-ticket 4

**Blocked by:** Sub-ticket 4 (or parallel once field names are agreed)
```

---

## Sub-ticket 6 — Push notification URL

```
**Title:** Set OneSignal announcement push URL to primary link when present

**Description:** `buildPushPayload('chapter_announcement')` currently deep-links to `/dashboard/announcements`. When a primary link exists, use it as `url` so tapping opens the external resource; document security/trust tradeoff (opens outside app).

**Acceptance criteria:**
- [ ] If `getPrimaryLinkFromMetadata` returns URL, push payload `url` is that HTTPS URL
- [ ] If absent, behavior unchanged
- [ ] Developer test-push UI still works for `chapter_announcement` event type

**Files relating:** `lib/services/notificationPushPayload.ts`, `app/api/announcements/route.ts` (if context must pass link into push builder)
```

---

## Sub-ticket 7 — Composer UI (all create flows)

```
**Title:** Add optional primary link URL and label to announcement compose forms

**Description:** Execs need one optional HTTPS URL field and optional short label in every UI that creates announcements, with helper copy explaining SMS/email/in-app use. Clear fields on successful send.

**Acceptance criteria:**
- [ ] `OverviewView` announcement section includes optional link + label, wired into `metadata` / `CreateAnnouncementData`
- [ ] `SendAnnouncementButton` dialog (or equivalent) includes same fields
- [ ] `GovernanceBroadcastHub` multi-chapter broadcast includes same fields and passes metadata per chapter
- [ ] Empty link sends no `primary_link` key (or omits from metadata object)
- [ ] Client-side UX: trim inputs; show validation hint for `https://` before submit where practical

**Files relating:** `components/features/dashboard/dashboards/ui/feature-views/OverviewView.tsx`, `components/features/dashboard/dashboards/ui/SendAnnouncementButton.tsx`, `components/features/governance/GovernanceBroadcastHub.tsx`
```

---

## Sub-ticket 8 — Reader UI (drawer, card, mobile)

```
**Title:** Show optional primary link prominently in announcement reader views

**Description:** When `getPrimaryLinkFromMetadata(announcement.metadata)` returns a link, render it above or before body text with accessible anchor (`target="_blank"`, `rel="noopener noreferrer"`), using label as link text when provided.

**Acceptance criteria:**
- [ ] `AnnouncementDetailDrawer` shows primary link block when present
- [ ] `AnnouncementsCard` list/snippet shows indicator or compact link when present
- [ ] `MobileAnnouncementsPage` matches behavior
- [ ] No raw `dangerouslySetInnerHTML`; URL comes from server-sanitized metadata only

**Files relating:** `components/features/dashboard/dashboards/ui/AnnouncementDetailDrawer.tsx`, `components/features/dashboard/dashboards/ui/AnnouncementsCard.tsx`, `components/features/dashboard/dashboards/ui/MobileAnnouncementsPage.tsx`, `lib/validation/announcementMetadata.ts`
```

---

## Sub-ticket 9 — QA / release checklist

```
**Title:** QA announcement primary link across SMS, email, push, and in-app

**Description:** End-to-end verification on staging (or preview) with real SendGrid/Telnyx sandbox constraints as applicable. Confirms epic acceptance criteria.

**Acceptance criteria:**
- [ ] Create announcement without link — all channels behave as before
- [ ] Create with link only — SMS CTA opens URL; email shows link; push opens URL (if implemented); in-app shows link block
- [ ] Create with link + image attachment — both appear
- [ ] Governance multi-chapter broadcast with link reaches expected chapters
- [ ] Document results in Linear comment with environment + date

**Steps to reproduce:**
1. Staging: compose announcement with primary link, enable email + SMS for test accounts
2. Verify delivery and tap targets on iOS + Android + desktop
3. Mark epic done when all sub-issues complete
```

---

## Dependency hints (for Linear descriptions)

| Sub-ticket | Suggested order |
|------------|-----------------|
| 1 Metadata verify | First (quick) |
| 2 Types + client | Early |
| 3 SMS | After 1–2 |
| 4 Email code | After 1–2; before or with 5 |
| 5 SendGrid template | After 4 (field names stable) |
| 6 Push | After 1–2 |
| 7 Composer | After 2 |
| 8 Reader | After 2 (can parallel 7) |
| 9 QA | Last |

---

*Ticket bodies follow [`LINEAR_TICKET_TEMPLATE.md`](./LINEAR_TICKET_TEMPLATE.md).*
