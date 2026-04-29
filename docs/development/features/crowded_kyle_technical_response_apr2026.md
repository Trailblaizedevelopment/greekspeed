# Crowded — Technical response & email context (Apr 2026)

**Purpose:** Clean reference for the team after Kyle’s email (CTO/engineering answers) and a practical **“where we left off → how to resume”** guide.  
**Original ask:** Partner API requirements PDF (`TB - Crowded API Requests (2).pdf` — same content as our partner requirements doc).  
**Do not commit secrets** (webhook `secret`, tokens, raw IPs).

---

## At a glance — what changed for us

| Topic | Before (our uncertainty) | After (Crowded’s answer) |
|--------|--------------------------|---------------------------|
| Contact → intent | We wondered if members must **finish Crowded onboarding** before intents work. | **No.** Partner-created contacts are **fully created server-side** in one step; no pending wallet path blocking intents. |
| `POST …/intents` | We hit validation / flow issues. | Every intent must include **`userConsented: true`** and **`payerIp`** (member’s browser IP). First intent records **terms consent** for that contact; show **your** terms + **link to Crowded’s terms** (they will send canonical URL). |
| Open-amount collections | Unclear vs portal. | **Supported:** omit **`requestedAmount`** on collection create = open; optional **`goalAmount`** for progress UI; payer enters amount at checkout. |
| “No customer” / blocked Collect | Confusing vs Postman mistakes. | **Bank application must be `Approved`** before chapter is “live”; until then expect **no customer / accept terms** style failures. Documented **org → chapter → applications** sequence below. |
| Webhooks | We guessed headers / signing. | **`X-Webhook-Signature`**: `sha256=<hex>` = HMAC-SHA256(**raw body bytes**, webhook `secret`). Recovery: failed/dlq listing, manual retry, and **GET intent by id** as source of truth. |
| IDs | `id` vs `uid` confusion. | Cheat sheet below (accounts = **numeric string**, payments in intent use **`uid`**, etc.). |

---

## Part 1 — Crowded answers (formatted from Kyle’s email)

### 4.1 Contacts, accounts, and intents

#### 4.1.1 Does a contact need to complete their own Crowded account before an intent can be created?

**No.**

- `POST /api/v1/chapters/:chapterId/contacts` creates a **full user record server-side** in a **single transaction**.
- There is **no** “pending onboarding” or “wallet setup” step the member must complete before attaching them to an intent.
- Partner-created contacts **skip the invitation email** path; Crowded assumes **your app** owns onboarding UX.

**Intent requirements (always):**

- `userConsented: true`
- `payerIp` — the **end user’s browser IP** (not only your server’s IP on behalf of the member for this field — Crowded uses it for consent).

On the **first intent** for a contact, Crowded records a **terms** consent (version + `payerIp`). **Product obligation:** show your terms **and** a link to **Crowded’s terms of service**; only then send `userConsented: true`. Crowded will share the **canonical terms URL** separately.

#### 4.1.2 Is “contact exists” enough to attach to an intent?

**Yes** — `POST /api/v1/chapters/:chapterId/collections/:collectionId/intents` accepts either:

1. **`contactId`** — UUID of an existing contact, **or**
2. **Inline payer** — `firstName`, `lastName`, `email`, optional `mobile`, optional `dateOfBirth` → Crowded **lazy-creates** the contact, then creates the intent.

**Checks:**

1. Contact exists (or inline create succeeds).
2. Contact’s **`chapterId`** matches **`:chapterId`** in the URL.

Then consent runs (4.1.1) and the response returns the intent + **`paymentUrl`**.

#### 4.1.3 In-between states (good to know — not blockers for partner API)

1. **Portal-invited members** — Invited via **Crowded portal** (not partner API) start as **Invited User** until signup. **Partner bulk-create does not hit this** (conversion is synchronous).
2. **Intent idempotency — one active intent per (collection, contact)**  
   - **Fixed** collection + intent **already paid** → **same intent returned** (no second payment on that intent).  
   - **Unpaid** intent, or **open-amount** collection → **existing intent updated in place**; **intent UID unchanged** across calls.  
   - **Treat the response as “current intent for this pair,”** not “always a brand-new row.”

---

### 4.2 Other items

#### 4.2.1 Open-amount / “pay what you want” collections

**Yes — via API.**

- Internally: **`requestedAmount === null`** (or **omitted**) ⇒ **Open**; present `requestedAmount` ⇒ **Fixed**.
- **`goalAmount`** is optional — used for **goal / progress display** on checkout; **does not cap** individual contributions.

Examples (conceptual):

| Mode | Shape |
|------|--------|
| Fixed | `{ title, requestedAmount: 5000 }` (minor units — confirm with Crowded for your product) |
| Open | `{ title }` — **omit** `requestedAmount` |
| Open + goal display | Add `goalAmount` |
| Recurring | Add `recurringPaymentsEnabled: true` |

**Trailblaize note:** `buildCrowdedDonationCollectionRequest` for **`open`** already **omits** `requestedAmount` (Crowded rejects `null` as “must be a number”). Align **fixed** dues collections with Crowded’s fixed shape as needed.

#### 4.2.2 Chapter not “fully live” — go-live checklist

**`NO_CUSTOMER` / similar** = chapter needs an **approved bank customer** (application approved).

**Partner go-live sequence:**

1. `POST /api/v1/organizations` → store **`organizationId`** (`id`).
2. `POST /api/v1/chapters` with `organizationId`, `name`, `businessVertical`, optional **`owner`** block → optional **`owner`** auto-creates a **treasurer-role contact** in the same call.
3. `POST /api/v1/chapters/:chapterId/applications` with officer + org details (EIN, SSN, address, phone, …) → response **`status: "Pending"`**.
4. **Wait for approval** — poll `GET /api/v1/chapters/:chapterId/applications` or webhooks:  
   `finance.application.submitted` | `.approved` | `.denied`  
   States: `Pending` → `PendingReview` → `AwaitingDocuments` (if needed) → **`Approved` | Denied | Canceled`**
5. **After `Approved`** — customer exists; **`POST /accounts`**, **`POST /collections`**, **`POST …/intents`**, **`POST /cards`**, etc. succeed. **Before** approval: expect **no customer / accept terms** style errors on those flows.

#### 4.2.3 Webhook signing and recovery

**Headers on every delivery:**

| Header | Meaning |
|--------|---------|
| `X-Webhook-Signature` | `sha256=<hex>` — HMAC-SHA256 of **raw JSON body**, keyed with webhook **`secret`** from registration |
| `X-Webhook-Batch` | UUID for this delivery batch |
| `X-Webhook-Batch-Count` | Number of events in the batch |
| `X-Webhook-Attempt` | Retry attempt (starts at **1**) |
| `Authorization` | Echo of `authorizationHeader` from registration, if you set one |
| `Content-Type` | `application/json` |
| `User-Agent` | Crowded webhook UA |

**Verification:** HMAC-SHA256 over **raw request bytes** — **do not** parse JSON and re-stringify (whitespace breaks verification).

**Node-style example (straight quotes):**

```js
import crypto from 'crypto';

const expected =
  'sha256=' +
  crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

const received = req.headers['x-webhook-signature'];
const ok =
  received.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
```

(In production, normalize case/whitespace on the header value before compare.)

**If you miss a delivery:**

1. `GET /api/v1/webhooks/:webhookId/events?filter[status]=failed|dlq` — failed / DLQ with attempt history.
2. `POST /api/v1/webhooks/:webhookId/events/:eventId` — manual retry (**failed** or **dlq** only).
3. **Authoritative fallback:**  
   `GET /api/v1/chapters/:chapterId/collections/:collectionId/intents/:intentId` → current **`status`** and **`payments[]`**.

**Useful event names** (full list: `GET /api/v1/webhooks/event-types`; `["*"]` may expand to all):

- `collect.payment.succeeded` | `.failed` | `.refunded`
- `collect.intent.created` | `.updated`
- `collect.payment_plan.created` | `.canceled` | `.completed`
- `collect.refund.initiated` | `.processing` | `.reversed`
- `finance.application.submitted` | `.approved` | `.denied`
- `finance.account.created` | `.updated` | `.closed`

#### 4.2.4 Terms / consent gates

Two surfaces — **both collected on your side** in UX:

1. **Member (contact)** — at checkout: your terms + **Crowded terms link** → then `POST …/intents` with `userConsented: true` + member **`payerIp`**.
2. **Bank application** — before submit: disclosures + officer acceptance → `POST …/applications` with **`contactIp`** = **officer’s browser IP** (not your server’s).

`additionalConsentUrl` on application response = **only** if Crowded configured extra partner consent; **ignore if absent**.

**Open item:** Joint **member terms UX review** with Crowded (wording + version alignment).

#### 4.2.5 IDs and response shapes (cheat sheet)

| Object | Primary id field | Wire format | Notes |
|--------|------------------|-------------|--------|
| Organization | `id` | UUID | |
| Chapter | `id` | UUID | |
| Contact | `id` | UUID | |
| Account | `id` | **numeric string** (e.g. `"10000"`) | **Not** UUID — keep **string** typed |
| Collection | `id` | UUID | |
| Intent | `id` | UUID | |
| Intent → contact | `contactId` | UUID | |
| Payment (in `intent.payments[]`) | **`uid`** | UUID | |
| Transaction | `id` | JSON integer / treat as **string** in storage | Bank rail semantics |
| Card | `id` | UUID | |
| Webhook registration | `id` | UUID | |
| Webhook event | `id` | UUID | |

**Also:** `paymentUrl` on the intent response is **already built** — do not hand-assemble Collect URLs.

---

## Part 2 — Email thread (short timeline)

| When (2026) | What happened |
|-------------|----------------|
| Apr 21 | Owen sent **API Needs for V1** (PDF / requirements). |
| Apr 22–24 | Kyle: forwarding to dev team, capacity / prioritization notes; internal alignment on **KYC per chapter**, **revenue/opportunity** questions, and clarifying **donations vs full banking** path. |
| Apr 24 | Owen clarified **two products** (admin hub vs social/alumni network) and partnership angles: **donations**, optional **banking**, **existing Crowded users** linking accounts. |
| Apr 29 | Kyle sent **CTO consolidated answers** (content in Part 1 above): contacts/intents, open collections, go-live checklist, webhooks, terms, IDs. **Open item:** member terms UX + Crowded terms link. |

**Commercial context (non-technical):** Crowded raised that **deeper build** often follows **contracted** partnerships and they need clarity on **opportunity / revenue**. That is a **business** follow-up separate from the technical answers above.

---

## Part 3 — Where we left off (blockers before this email)

These matched our integration work and partner doc (`crowded_partner_api_requirements.md` / PDF), not necessarily a single day’s bugs.

1. **Intents failing or unclear** — uncertainty whether **Crowded member account completion** was required before **`POST …/intents`**. **Resolved:** not required for partner-created contacts; **do** send `userConsented` + `payerIp` and terms UX.
2. **Open collections** — portal vs API parity. **Resolved:** omit `requestedAmount` for open; optional `goalAmount` for display.
3. **`NO_CUSTOMER` / terms** — chapter not live. **Resolved:** follow **applications → Approved** path; until then accounts/collect may fail by design.
4. **Webhooks** — guessed signing. **Resolved:** prefer **`X-Webhook-Signature`** + raw body HMAC; recovery endpoints + **GET intent** as truth.
5. **ID confusion** — use their cheat sheet; store account/transaction ids as **strings**.
6. **Business alignment** — who pays for Crowded vs Trailblaize scope, how many chapters are realistic **first customers**, donations-only vs full bank. **Still on partnership / product**, not closed by the technical memo.

---

## Part 4 — How to pick back up (engineering checklist)

1. **Intent creation path**  
   - Ensure **`crowdedDuesPaymentIntent`** (or equivalent) always sends **`userConsented`** and **`payerIp`** from the **member session** (browser), not placeholder IPs in production.  
   - Add or verify **UI**: member sees **Trailblaize terms + Crowded terms link** before consent.

2. **Open donation collections**  
   - Confirm `buildCrowdedDonationCollectionRequest` **`open`** branch stays aligned: **omit** `requestedAmount` (already the case).  
   - Re-test **fixed** collection payloads against Crowded’s fixed example.

3. **Webhook verifier**  
   - **`crowdedWebhookSignature.ts`** already includes **`x-webhook-signature`**. Tighten to **prefer** `X-Webhook-Signature` + `sha256=` prefix per Crowded doc; keep **raw body** verification (Next.js route must use **raw text**, not re-serialized JSON).

4. **Application / go-live**  
   - If product should onboard chapters **fully via API**, map UI to: org create → chapter create (with `owner` if treasurer bootstrap is desired) → **applications** → poll/webhook until **Approved** → then expose Collect.

5. **Idempotency mental model**  
   - Dues flows should treat **`POST …/intents`** as **upsert current intent** per (collection, contact); handle **paid fixed** “returns same intent” behavior in UI (e.g. don’t assume new UUID every time).

6. **Schedule with Crowded**  
   - **Member terms UX review** + canonical **Crowded ToS URL** for embed.

7. **PDF**  
   - `TB - Crowded API Requests (2).pdf` is the **exported requirements**; this file is the **reply + operational follow-up**. Keep both in sync if requirements change.

---

## Part 5 — Suggested reply to Kyle (optional draft)

> Thanks Shay and Kyle — this clears our biggest engineering unknown (partner contacts don’t need to complete Crowded onboarding before intents; we’ll wire `userConsented` + `payerIp` and the dual terms UX). We’ll align our webhook verifier to `X-Webhook-Signature` + raw body HMAC and our open-collection payloads to omit `requestedAmount`. Let’s schedule the member terms UX review and share the canonical Crowded ToS link. Separately we can follow up on [commercial / rollout] with [name].

---

## Revision history

| Date | Author | Change |
|------|--------|--------|
| 2026-04-29 | Trailblaize | Created from Kyle’s forwarded CTO response + thread summary + resume checklist |
