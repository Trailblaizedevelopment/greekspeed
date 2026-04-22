# SMS delivery hardening roadmap

This document tracks **identity, routing, operations, and observability** for Trailblaize SMS (Telnyx today). It complements code in `lib/services/sms/`, `app/api/webhooks/telnyx/`, and `app/api/announcements/`.

## Constraint (shared with engineering and support)

No implementation can guarantee that **every** opted-in handset **always** receives **every** SMS on the **first** attempt. After Telnyx accepts a message, **mobile carriers** apply spam filtering, throughput caps, and subscriber-level rules that we do not control. Enterprise posture means: **maximize odds**, **record provider message IDs**, **surface final outcomes**, and **fallback channels** for critical content.

---

## Current Telnyx snapshot (update when configuration changes)

Last reviewed from Mission Control (keep this section current after changes).

| Item | Value / notes |
|------|----------------|
| **Production sending number** | `+1 (662) 281-7812` — assigned to messaging profile **Trailblaize Notifications** |
| **Messaging profile** | Trailblaize Notifications — profile ID `40019a21-b446-458d-83ce-b189fa7451fc` (from portal URL) |
| **Outbound webhook** | `https://www.trailblaize.net/api/webhooks/telnyx` |
| **Webhook failover URL** | Empty — optional hardening: set a secondary endpoint or monitoring alert if primary is down |
| **10DLC campaign** | Active; use case aligned with chapter informational SMS; number **Assigned** to campaign |
| **Carrier terms (examples)** | AT&T SMS TPM (e.g. 75), T-Mobile brand tier **LOW** with **daily** caps (e.g. 2000/day to T-Mobile subs) — confirm live values in **Compliance → campaign → carrier terms preview** |
| **Profile outbound UI** | Long-code rate hint may show **2 msg/min** in profile UI while campaign carrier table shows higher TPM — **code/workers must respect the stricter effective limit** and Telnyx/carrier docs |
| **Restrict to mobile only** | If enabled on profile, landlines / certain VoIP routes may be blocked by design |

### TCR / brand registry (10DLC)

| Field | Value |
|-------|--------|
| **Brand ID** | `4b20019a-08e0-490f-34cd-659f46664b9c` |
| **TCR ID** | `B95ZDJ9` |
| **Brand status** | Verified |
| **Vetting status** | **Unvetted** (see below) — standard/enhanced vetting may upgrade throughput and trust tier when approved |
| **Legal name** | Trailblaize |
| **Website** | `https://www.trailblaize.net` |
| **Brand contact** | On file in Telnyx (Mission Control → Compliance → Brand) |

**What “standard” and “enhanced” vetting mean (high level)**  
The Campaign Registry (TCR) and carriers use **brand vetting** to raise trust for higher-volume or more sensitive traffic. **Unvetted** brands often sit in a **lower default tier** (e.g. T-Mobile “LOW” brand tier with tighter **daily** limits). **Standard** and **Enhanced** vetting are progressively stronger identity and business checks; approval can **increase throughput**, improve **deliverability**, and reduce arbitrary filtering for legitimate traffic—subject to carrier policy. Vetting does **not** remove spam filters or guarantee every message is delivered. After you submit vetting, watch Telnyx for status changes and updated **carrier terms preview** numbers.

**If live message logs still show `tcr_campaign_registered: NOT REGISTERED`:** treat as a **configuration or propagation** issue—confirm the **same** messaging profile and number used in production are attached to the **active** campaign, and that API sends use that profile. Escalate to Telnyx support with **message IDs** if mismatch persists.

---

## Phase 0 — Identity and routing (Telnyx / carrier compliance, mostly non-code)

**Goal:** Same traffic class, registered sender, aligned campaign so filtering is not arbitrary.

1. Audit Telnyx for the **production** number and messaging profile: **10DLC / TCR** (or toll-free / short code if that becomes your path). Resolve any **NOT REGISTERED** or campaign–use-case mismatch.
2. **Document use case** in plain language: chapter member **transactional / community alerts** for opted-in users vs broad marketing — campaign text in Telnyx must match what the product actually sends.
3. **Sender consistency:** one primary sending number (or an explicit pool) tied to that campaign; avoid ad-hoc number or profile changes without updating compliance.
4. **Deliverability:** if **40002** (or similar) persists after registration is clean, open a Telnyx deliverability ticket with **message IDs** and **carriers**.

**Exit criterion:** Telnyx shows an **active** campaign and profile aligned with production traffic; no unexplained **not registered** on live sends; carrier terms preview understood for caps.

---

## Phase 1 — Strict data model and lifecycle (app owns “truth”)

**Goal:** Every outbound SMS has a row, **provider message id**, and **terminal status** updated from webhooks.

1. Define lifecycle (names can match DB): e.g. `queued` → `submitted` (has `telnyx_id`) → `delivered` | `failed` | optional `unknown` with timeout.
2. **Fix the announcement bulk gap:** today bulk announcement flows can log rows **without** `telnyx_id`, so webhooks cannot correlate — root cause of “silent” DB vs Telnyx.
3. **Per recipient, per logical send:** persist `telnyx_id` from `sendBulkSMS` / per-recipient send results onto the user’s log row (or a dedicated `sms_outbound` table keyed by `announcement_id` + `user_id`).
4. Adjust **“first SMS”** / compliance helpers so `status = 'sent'` is not treated as “delivered to phone” unless that is explicitly defined; prefer **submitted vs carrier final** semantics.

**Exit criterion:** Test announcement to two numbers yields **two** `telnyx_id` values in the DB and webhook updates move rows to **failed** or **delivered**.

---

## Phase 2 — Webhook contract (observability + security)

**Goal:** All delivery outcomes land in the DB; webhooks are trustworthy.

1. Normalize parsing for Telnyx shapes (`message.finalized`, wrapped `data.event_type`, etc.); add **tests** or fixture JSON.
2. Enforce **Telnyx webhook signature** verification using `TELNYX_WEBHOOK_SECRET` (document in `.env.example` when enforced).
3. Map errors: persist `errors[0].code` (e.g. `40002`) and **title**, not only `detail`.
4. **Idempotent** updates for repeated events on the same `messageId`.

**Exit criterion:** A known failed delivery updates the **same** DB row with **code + status**.

Reference: [Telnyx — receive webhooks](https://developers.telnyx.com/docs/v2/messaging/receive-webhooks).

---

## Phase 3 — Routing and scale (queue + workers)

**Goal:** 100+ recipients do not depend on one HTTP request; retries and rate limits are controlled.

1. Move **bulk announcement SMS** off the critical path of `POST /api/announcements`: enqueue a job (`announcement_id`, chapter, snapshot or query plan).
2. Worker (Inngest, QStash, Supabase + cron, or dedicated worker) with:
   - Concurrency aligned with **Telnyx + carrier** limits (see carrier terms preview),
   - Retries only for **transient** API errors (not definitive spam failures unless product policy says otherwise),
   - **Idempotency** per recipient per announcement.
3. Start from current batching; tune using metrics from Phase 4.

**Exit criterion:** Announcement API returns quickly; SMS drains under load; **per-recipient** failures visible.

---

## Phase 4 — Operations, testing, and strict structure

**Goal:** Prove behavior in staging; reproduce issues in prod.

1. **Environments:** separate Telnyx profile or keys for dev/staging vs prod; document sandbox vs live numbers.
2. **Test matrix:** volunteers on Verizon / AT&T / T-Mobile (and an MVNO if possible); scripted sends (plain text, URL-heavy, MMS); record Telnyx id, DB status, handset receipt.
3. **Dashboards / SQL views:** delivery rate by error code, chapter, carrier (from webhook payload when available).
4. **Runbook:** “User did not get SMS” → opt-in, E.164, row status, `telnyx_id`, error code, campaign registration.
5. **Product copy:** distinguish “queued to provider” vs “delivered to phone” when UI surfaces status.

**Exit criterion:** One **checklist** QA/support use for every release touching SMS.

---

## Phase 5 — Multi-channel fallback (product, not CPaaS)

**Goal:** Critical announcements are not SMS-only.

- For urgent flows: **parallel email** (and in-app notification records) with the same summary so a carrier block is not total silence.

---

## Phase 6 — Customer engagement and journey platforms (future cycle)

**Goal:** Non-engineer-friendly journeys, frequency caps, cross-channel orchestration, and stronger operational maturity—**after** Phases 0–2 (and ideally 3) are in place, because engagement platforms still sit on top of **carriers** and need the same **IDs, webhooks, and consent** discipline.

**Representative options:** Braze, Iterable, Customer.io, Salesforce Marketing Cloud, Adobe Journey Optimizer.

**Notification infrastructure (orchestration, often before a full CDP):** For a **Courier vs Novu** comparison aligned to Telnyx + SendGrid + OneSignal, see [NOTIFICATION_ORCHESTRATION_COURIER_VS_NOVU.md](./NOTIFICATION_ORCHESTRATION_COURIER_VS_NOVU.md).

**Integration pattern (when ready):**

1. **Single source of truth** for consent and chapter membership remains in Trailblaize (Supabase).
2. **Sync or stream** identity + subscription attributes to the vendor (batch + real-time hooks), or invoke vendor APIs from **server-side** workers for campaign steps.
3. **SMS leg** remains a registered sender; vendor or Telnyx provides delivery analytics—**correlate** back to `announcement_id` / `user_id` in our DB for support.
4. Evaluate **cost**, **SOC2**, **data residency**, and **who owns templates** (marketing vs chapter admins).

This phase is **optional** and does not replace Phases 1–3 for first-party reliability.

---

## What you are not required to do immediately

- **Braze / Iterable / Customer.io** — add when journey ownership and budget justify; prerequisites remain Phases 0–2 (and 3 for scale).
- **Switching from Telnyx to Twilio** — only if compliance and support are insufficient after Phase 0; structural fixes **transfer** to any CPaaS.

---

## Suggested next steps (engineering)

1. **Reconcile rate limits:** Compare messaging profile **outbound** rate hints, **carrier terms preview** TPM/daily caps, and `sendBulkSMS` batching in `smsServiceTelnyx.ts` — adjust worker concurrency so you never exceed the **strictest** applicable limit (including **2 msg/min** if that remains the effective long-code gate until vetting upgrades terms).
2. **Implement Phase 1 + 2** first (DB correlation + webhook verification + error codes)—largest reduction in “silent” failures vs internal state.
3. **Phase 3** once announcements regularly exceed safe synchronous bounds or Vercel timeout risk.
4. **Update this doc** when vetting status flips from Unvetted, when failover URL is set, or when carrier table numbers change.

---

## Related code (for implementers)

| Area | Location |
|------|-----------|
| Telnyx send / bulk batching | `lib/services/sms/smsServiceTelnyx.ts` |
| Per-notification logging | `lib/services/sms/smsNotificationService.ts` |
| Announcement SMS | `app/api/announcements/route.ts` (`sendMemberSms`, `sendAlumniSms`) |
| Delivery webhooks | `app/api/webhooks/telnyx/route.ts` |
| Env vars | `.env.example` (`TELNYX_*`, `TELNYX_WEBHOOK_SECRET`) |
