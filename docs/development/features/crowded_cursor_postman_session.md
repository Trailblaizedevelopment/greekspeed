# Crowded API — Cursor / Postman exploration session

**Purpose:** Single living doc for this integration thread: what we verified in Postman (sandbox), findings, and how they map to Trailblaize code and [Linear — Crowded Integration Strategy](https://linear.app/trailblaize/project/crowded-integration-strategy-6e845cc7474a/overview).

**Do not commit API keys or paste full tokens into this file.** Use placeholders like `{{api_token}}` or “redacted”.

---

## Confirmed working — sandbox (Mar 2026)

| Setting | Value |
|---------|--------|
| **API base (`base_url`)** | `https://sandbox-api.crowdedfinance.com` (no trailing slash) |
| **Auth** | **Bearer Token** — same JWT Crowded issued (not `X-API-Key` for this token) |
| **Sanity request** | `GET {{base_url}}/api/v1/organizations` → **200 OK** |
| **Postman** | **Desktop** recommended; Cloud Agent had empty-host / TLS issues on other hosts |

**Why not `api.alpha.staging.crowded.me` (for now):** TLS handshake failures (`EPROTO` / alert 40) occurred from Postman in some setups. **`https://sandbox-api.crowdedfinance.com`** is publicly reachable and works with the sandbox Bearer token. Confirm with Kyle whether production will differ; keep both URLs below for reference.

---

## Where we are (sandbox — verified Mar 2026)

Summary of what Postman **against `sandbox-api.crowdedfinance.com`** has proven so far (partner Bearer token, correct `{{chapter_id}}` / `{{contact_id}}` path vars):

| Step | Result | Notes |
|------|--------|--------|
| `GET /organizations` | **200** | Org `Trailblaize` + org UUID in `data`. |
| `GET /chapters` | **200** | Chapter UUID for `chapter_id` env; `organizationId` matches org. |
| `GET /chapters/{{chapter_id}}/contacts` | **200** | At least one contact; use `data[].id` as **`contact_id`**. |
| `GET /chapters/{{chapter_id}}/contacts/{{contact_id}}` | **200** | Single contact shape (`id`, `chapterId`, `firstName`, `lastName`, `email`, …). |
| `GET /chapters/{{chapter_id}}/accounts` | **200** or **400** | **200** once banking customer is provisioned (Finish setup); list payload uses **nested `data.data`** and account **`id`** is often a **numeric string** (see Pass 2). **400 `NO_CUSTOMER`** if customer not ready — not a path bug. |
| `POST /chapters/{{chapter_id}}/collections` | **201** or **401** | **Apr 2026:** **201 Created** with `data.id` as **`collection_id`** when org is unblocked ([Pass 3](#pass-3--collect--collection-links-dues)). Some orgs still see **401** *accept terms* — portal / Crowded. |
| `POST …/collections/…/intents` | **200** | **`data`**: `{ contactId, requestedAmount, payerIp, userConsented }` (all under **`data`**). Response **`data.paymentUrl`** = member checkout ([Pass 3](#pass-3--collect--collection-links-dues)). |

**Implication for app work:** **Collect flow** is **Postman-verified** and implemented in repo (**[TRA-414](https://linear.app/trailblaize/issue/TRA-414)** — `CrowdedClient.createCollection` / `createIntent`, optional Next routes). Next product step: **[TRA-415](https://linear.app/trailblaize/issue/TRA-415)** dues UX. Pass **real `payerIp`** and **`userConsented`** from the member session in production.

---

## Progress snapshot — Apr 2026 (local smoke E2E)

End-to-end **`npm run test:crowded`** now completes successfully when Crowded returns **200** on accounts list, Supabase has **`chapters.crowded_chapter_id`**, migration **`crowded_account_id` → TEXT** is applied, and `.env.local` includes Crowded + **`CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID`** + Supabase **service role** (see [Local CLI smoke](#local-cli-smoke--tra-412-full-upsert-path)).

| Delivered | Notes |
|-----------|--------|
| **Accounts list unwrap** | API returns `{ "data": { "data": [...], "meta" } }`; client flattens before mapping/Zod (`unwrapCrowdedAccountsListPayload` in `crowded-client.ts`). |
| **Opaque account ids** | `public.crowded_accounts.crowded_account_id` is **TEXT**; migration `20260408190000_crowded_account_id_to_text.sql` (drop/re-add composite FK from `crowded_transactions`). |
| **Sync path** | `listAccounts` + `upsertCrowdedAccountsFromList` / mapping smoke → **`TRA-412: crowded_accounts upsert OK — N row(s)`**. |
| **Error bodies** | `CrowdedApiError` normalizes `details` (string / array / object) so `isCrowdedNoCustomerError` and smoke catches never throw on odd shapes. |
| **GET single account** | **Best-effort in smoke only:** Crowded may return **400** `chapterId must be a positive integer` when using list `id` in `GET …/chapters/{uuid}/accounts/{id}` while **list** still returns **200**. Script logs a warning and continues; product sync should rely on **list**, not single GET, until Crowded confirms path/id rules. |
| **Bulk create** | **POST** `…/chapters/:chapterId/accounts` — sandbox **200** + **repo:** `CrowdedClient.bulkCreateAccounts`, types/Zod, unit tests, optional `POST /api/chapters/[id]/crowded/accounts/bulk`. **[TRA-413](https://linear.app/trailblaize/issue/TRA-413/implement-crowded-chapter-account-creation-client-optional-api) Done.** |

**Still open:** **POST collections** **401** *accept terms* for orgs not yet unblocked ([Pass 3](#pass-3--collect--collection-links-dues)); webhooks ([Pass 4](#pass-4--webhooks)); treasurer UI ([TRA-417](https://linear.app/trailblaize/issue/TRA-417)); transaction sync ([TRA-418](https://linear.app/trailblaize/issue/TRA-418)). **TRA-414** code shipped — see implementation scan table.

---

## App ↔ Crowded E2E — manual verification (Apr 2026)

**Linear tracking:** [TRA-605](https://linear.app/trailblaize/issue/TRA-605) (Devin × Cursor milestone) and related dues/Crowded issues.

### What we confirmed end-to-end (Trailblaize local + Crowded **staging**)

| Step | Result |
|------|--------|
| Chapter config | `crowded_integration_enabled` + `chapters.crowded_chapter_id` + server `CROWDED_API_*` env. |
| Treasurer — dues cycle | Create cycle via API/UI; RLS aligned with `canManageChapterForContext` (migration `20260408193000_dues_cycles_rls_unified_writes.sql`). |
| Treasurer — link collection | **Crowded checkout** card on Exec Admin → Dues (Overview): `POST /api/chapters/[id]/crowded/collections` then **`PATCH /api/dues/cycles/[id]`** persists `dues_cycles.crowded_collection_id`. |
| Treasurer — assign member | Bulk (or single) assign with **cycle id + amount &gt; 0** → `POST /api/dues/assignments` **200**. |
| Member — dues page | `/dashboard/dues` loads assignments with embedded cycle (**shared `createBrowserClient`** + `unwrapDuesCycleEmbed` in `lib/utils/duesEmbeds.ts`; fixes null `cycle` / **Invalid Date**). |
| Member — pay | Consent + **`POST /api/dues/pay`** **200** → redirect to **`https://staging.collect.crowdedme.xyz/collection/{collectionId}?collectintentuuid=…`**. |
| Crowded portal | **`staging.portal.crowdedme.xyz`**: collection appears (e.g. **Crowded Cycle Two**); contact shows **Collect request** (Not Paid); dashboard feed; **email notifications** observed when flows run. |

**Staging hosts (reference):** Collect checkout **`staging.collect.crowdedme.xyz`**; org portal **`staging.portal.crowdedme.xyz`**. These are **not** production money movement; use Crowded’s guidance for test cards / ACH in staging (arbitrary PANs may show *card type not accepted*).

### What is **not** the full closed loop yet

| Gap | Why it matters |
|-----|----------------|
| **No Crowded → Trailblaize webhook** | **[TRA-416](https://linear.app/trailblaize/issue/TRA-416)** not implemented. Paying on Collect does **not** automatically update `dues_assignments`, `profiles.current_dues_amount`, or `payments_ledger` in Supabase. |
| **Success URL is UI-only** | `?success=true` on `/dashboard/dues` triggers a refetch only; data stays stale until something writes the DB. |
| **Stripe / fallback** | Still not in repo for dues pay when Crowded is off. |
| **Treasurer UX polish** | Bulk assign must use **positive amount** (API validation); optional UX hardening tracked under **[TRA-417](https://linear.app/trailblaize/issue/TRA-417)**. |

**Bottom line:** The integration **does** handle **discovery → assign → member checkout handoff** on staging. It does **not** yet handle **post-payment reconciliation** in Trailblaize without new work (webhook + sync service, **[TRA-418](https://linear.app/trailblaize/issue/TRA-418)**).

### Code map (dues ↔ Crowded path)

| Area | Path |
|------|------|
| Cycles API (session cookies) | `app/api/dues/cycles/route.ts`, `app/api/dues/cycles/[id]/route.ts` |
| Member pay | `app/api/dues/pay/route.ts` |
| Create collection | `app/api/chapters/[id]/crowded/collections/route.ts` |
| Treasurer UI | `app/dashboard/admin/executive/TreasurerDashboard.tsx` |
| Member UI | `app/dashboard/dues/DuesClient.tsx`, `components/features/dashboard/dashboards/ui/DuesStatusCard.tsx` |
| Cycle embed helpers | `lib/utils/duesEmbeds.ts` |

---

## Crowded base URLs (reference)

| URL | Notes |
|-----|--------|
| `https://sandbox-api.crowdedfinance.com` | **Use for sandbox development & Postman** (verified 200 on organizations). |
| `https://api.alpha.staging.crowded.me` | Alternate staging host; TLS/agent issues reported — retry later with Desktop agent or ask Crowded. |
| `https://api.crowded.me` | **Production** — separate token from Crowded; not for day-to-day dev until go-live. |

---

## Auth summary (meeting + verification)

- **Sandbox token:** `Authorization: Bearer <JWT>`  
- **Production:** `api.crowded.me` + manually issued production token (no self-serve portal yet).  
- Postman collection defaults may still say **API Key / X-API-Key** — override with **Bearer** at collection or request level.

---

## Before you start (pre-flight)

1. **Environment** `Crowded API - Trailblaize`: set **`base_url`** = `https://sandbox-api.crowdedfinance.com`, **`api_token`** = full JWT (Current value). Save. Select this environment (top-right).
2. **Collection** `Crowded API Docs V0.9` → **Authorization** → **Bearer Token** → `{{api_token}}` → Save. (Avoid conflicting `base_url` on collection vs environment — prefer one source of truth, usually **environment**.)
3. **Sanity check:** `GET {{base_url}}/api/v1/organizations` → **200**.
4. **Chapter ID (required for almost all chapter-scoped calls):** run **`GET {{base_url}}/api/v1/chapters`** → copy **`data[0].id`** (or the chapter you need) into the environment variable **`chapter_id`**. Save the environment. Without this, path params stay empty or wrong — see [403 and literal chapter_id in path](#403-and-literal-chapter_id-in-path) below.
5. Optional: Postman **Console** (**View → Show Postman Console**) — after **Send**, confirm the resolved URL contains a **UUID** in the path (e.g. `/chapters/c651e8dd-…/accounts`), not the literal text `chapter_id`, and that `Authorization: Bearer` is present.

---

## Pass 1 — Organizations & chapters (ID mapping)

**Goal:** Link Trailblaize `chapters` to Crowded org/chapter IDs.

**In Postman:** Organizations → Get all; then **Chapters** folder → Get all (or equivalent).

**Capture:** Redacted JSON samples or screenshots of response bodies.

### Findings — Pass 1 (organizations + chapters — sandbox)

| Item | Notes |
|------|--------|
| Sandbox `base_url` used | `https://sandbox-api.crowdedfinance.com` |
| Org `id` / `name` | From `GET /organizations`: `Trailblaize` org UUID (confirm matches `chapter.organizationId` below). |
| `meta` pagination | Nested: `meta.pagination` with `total`, `limit`, `offset`, `sort`, `order` (see samples). |
| Sample chapter id(s) | `c651e8dd-a3b0-4756-91a0-30d18e22d714` (sandbox; **use as `chapterId` path param** for Accounts + Collect). |
| Chapter fields (live **GET /chapters** sample) | `name` may be `null`; `organization` = display string (`Trailblaize`); `organizationId` links to org; `status` (e.g. `Active`); `businessVertical` (e.g. `SororitiesFraternities`); `createdAt`. |
| `organizationId` on chapter | `c1f85333-2782-478d-97d3-458e3420cecf` — must equal org `id` from **Organizations → Get all** (verify in Postman if any digit mismatch). |
| Mapping hypothesis | **1:1:** Supabase `chapters.id` (our PK) ↔ store **Crowded chapter UUID** (`crowded_chapter_id` or column on `crowded_accounts` / mapping table). Use Crowded `chapterId` in all chapter-scoped API paths. Optionally cache `organizationId` for org-level calls. |

**Live Chapters — Get all (sandbox) sample shape:**

```json
{
  "data": [
    {
      "id": "c651e8dd-a3b0-4756-91a0-30d18e22d714",
      "name": null,
      "organization": "Trailblaize",
      "organizationId": "c1f85333-2782-478d-97d3-458e3420cecf",
      "status": "Active",
      "businessVertical": "SororitiesFraternities",
      "createdAt": "2026-01-25T21:38:18.000Z"
    }
  ],
  "meta": { "pagination": { "total": 1, "limit": 10, "offset": 0, "sort": "createdAt", "order": "DESC" } }
}
```

**Postman env tip:** Add variable **`chapter_id`** = the UUID from **`GET /chapters`** → `data[].id` (historical sandbox example: `c651e8dd-a3b0-4756-91a0-30d18e22d714`). Re-copy after new sandbox data if IDs change.

**Path variables (critical):** For any request with `:chapterId` in the URL, open the **Params** tab → **Path Variables** → set **`chapterId`** to **`{{chapter_id}}`** (with double curly braces). If the value is the plain text `chapter_id` or an empty cell, the API receives the literal string `chapter_id` and returns **403** — see troubleshooting below.

**Tickets:** TRA-410, TRA-412, TRA-413.

### Contacts (list + get by id) — verified

| Request | Path |
|---------|------|
| List | `GET {{base_url}}/api/v1/chapters/{{chapter_id}}/contacts` |
| One contact | `GET {{base_url}}/api/v1/chapters/{{chapter_id}}/contacts/{{contact_id}}` |

**Env:** `contact_id` = UUID from list response `data[].id` (sandbox example contact id: `aecc6ddb-b3d7-406c-96af-418fb0a2fb42` — re-verify if sandbox is reset).

**404** `Contact with ID contact_id not found…` means the path still sent the literal string `contact_id` — use **`{{contact_id}}`** in Path Variables, not plain text.

---

## Pass 2 — Accounts (create / list)

**Goal:** Payloads/IDs for `crowded_accounts`.

### Findings — Pass 2

| Item | Notes |
|------|--------|
| **List endpoint** | `GET {{base_url}}/api/v1/chapters/:chapterId/accounts` |
| **Path param** | `chapterId` = real Crowded chapter UUID (sandbox: `c651e8dd-a3b0-4756-91a0-30d18e22d714`), **not** the literal string `chapter_id`. |
| **Response shape** (list; live **200**) | Observed: top-level **`data` wraps another object** — `{ "data": { "data": [ …accounts… ], "meta": { "pagination": … } } }` (not a flat `data: []`). Each account’s **`id`** may be an **opaque string** (e.g. numeric `"12832675"`), not a UUID. Client unwraps to `{ data, meta }` before mapping; DB column `crowded_account_id` is **TEXT**. Fields also include `name`, `status`, `accountNumber`, `routingNumber`, `currency`, balances, `contactId`, `product`, `createdAt`. |
| **Live error (path correct)** | **400** `ResourceInputSafeError`, `details: ["NO_CUSTOMER"]`, message `"No customer was found for operation"` — chapter/org exists but **banking customer** not provisioned (portal **Finish setup** or Crowded support). |
| **Fields to persist (app)** | `crowded_account_id` ← `id`; link to our `chapter_id`; optional cache: `status`, `currency`, balances; `contactId` if we sync contacts. **Do not** store full account/routing in logs; treat as sensitive in UI. |
| **GET single account** | `GET …/chapters/:chapterId/accounts/:accountId` — in sandbox, using **`id` from list** sometimes yields **400** `chapterId must be a positive integer` while list works; confirm correct path/account identifier with Crowded. App sync uses **list** for upserts. |
| **Bulk create accounts** | `POST {{base_url}}/api/v1/chapters/:chapterId/accounts` — same path as **GET** list; path var **`chapterId`** = **`{{chapter_id}}`**. Each `data.items[]` entry requires **`contactId`** (contact UUID) + **`product`**: **`wallet`** or **`perdiem`** only — not `checking` (chapter primary checking from **GET list** uses `product: checking`; bulk create is a different product set). **`data.idempotencyKey`**: UUID v4 per logical request. **Validation (400):** `product is required`; `product must be one of: wallet, perdiem`. **Verified 200** response: [subsection below](#bulk-create-accounts--verified-sandbox-apr-2026). Ticket: [TRA-413](https://linear.app/trailblaize/issue/TRA-413/implement-crowded-chapter-account-creation-client-optional-api). |

**Tickets:** TRA-412, TRA-413, TRA-410.

### Bulk create accounts — verified (sandbox, Apr 2026)

**Request body (example):**

```json
{
  "data": {
    "items": [
      {
        "contactId": "<contact-uuid-from-GET-contacts>",
        "product": "perdiem"
      }
    ],
    "idempotencyKey": "<uuid-v4>"
  }
}
```

**Success (`200`) — shape observed:**

```json
{
  "data": {
    "totalProcessed": 1,
    "successCount": 1,
    "failedCount": 0,
    "results": [
      {
        "contactId": "<uuid>",
        "accountId": "12988060",
        "product": "perdiem",
        "error": false,
        "message": "Account",
        "accountCreated": true,
        "cardCreated": false
      }
    ]
  }
}
```

**Notes for implementers:** `results[].accountId` is an **opaque string** (numeric), consistent with **GET list** account `id`. After bulk create, **`GET …/accounts`** (list) can be re-run and **`upsertCrowdedAccountsFromList`** will pick up new rows if product policy includes syncing per-diem accounts. **`cardCreated`** may be `false` when cards are not issued for that product.

**Next steps (product / engineering):** implement `CrowdedClient.bulkCreateAccounts` (or equivalent), types + optional Zod, optional gated `app/api/...` route, unit tests; optionally extend `npm run test:crowded` or a dedicated script for manual sandbox verification (idempotent retries with same `idempotencyKey`).

**Troubleshooting:** Path param must be `{{chapter_id}}`, not literal `chapter_id` (else 403 / wrong chapter). **400 `NO_CUSTOMER`:** banking customer not ready — complete **Finish setup** in portal (below) or ask Crowded to provision sandbox.

### 403 and literal chapter_id in path

This message means the server treated the chapter identifier as the **literal string** `chapter_id`, not a UUID. Common causes:

| Cause | Fix |
|--------|-----|
| **`chapter_id` env var empty** | Run **`GET /chapters`**, copy `data[].id` into **Environment → `chapter_id` → Current value**, Save. |
| **Path variable typed as `chapter_id` without `{{ }}`** | In **Params → Path Variables**, set `chapterId` to **`{{chapter_id}}`** so Postman substitutes the UUID. |
| **Wrong collection / request** | Open **Console** after Send; the resolved URL must show `/chapters/<uuid>/…`, never `/chapters/chapter_id/…`. |

**Contacts — GET by id:** If the request has `:contactId`, you must use a **real contact UUID** from **list/create contacts** for that chapter — same rule: **`{{contact_id}}`** in path params, not the literal `contact_id`.

After the path shows a real UUID, **403** should clear if your token has access to that chapter. If you still get **403** with a valid UUID in the URL, treat it as a **real permission / token scope** issue and ask Crowded.

---

## Crowded staging portal — Finish setup (brief)

**URL:** `https://staging.portal.crowdedme.xyz` (log in as your sandbox user).

| Step | What to do |
|------|------------|
| 1 | Click **Finish Setup** (blue banner) or equivalent until the org-type modal appears. |
| 2 | **Select your organization type** → choose **Nonprofit** (matches Greek/chapter use and API `SororitiesFraternities`). Use **For-Profit** only if your legal entity is for-profit and Crowded/Kyle confirm. |
| 3 | Click **Save** (enabled after a selection). |
| 4 | Complete each following screen (legal name, EIN, address, beneficial owners, etc.) using **sandbox/test** data Crowded allows — if a field blocks you, ask **Kyle** for staging shortcuts or test values. |
| 5 | Finish until the **“finish bank account”** flow is done: banner gone or **Crowded Checking** clearly active, not just $0 placeholder with setup pending. |
| 6 | Return to Postman → **GET** `…/chapters/{{chapter_id}}/accounts` — expect **200** with real account rows (not `NO_CUSTOMER`). |
| 7 | If **`POST …/collections`** returns **401** `"To proceed, please accept terms"`, complete any **terms / agreements** Crowded shows in the portal (or ask Crowded where partner accounts accept them). |

**Then:** **Contacts** → **Collections** in UI or API as planned.

### Business details modal (blockers: legal name, website, address)

Crowded asks for **Legal Entity Name**, **Website**, **Registered Business Address** (street, no P.O. box). The form says *“Not incorporated? Keep scrolling”* — scroll the modal for an alternate path if Trailblaize is not yet a formal entity.

| Field | Where to get it (real) | Sandbox / unblock |
|-------|-------------------------|-------------------|
| **Legal entity name** | Exact name on **EIN** (IRS CP 575) or state formation (LLC/Corp charter). Ask **whoever filed the company** (founder, accountant, lawyer) or check **state business registry**. | **Kyle / Crowded:** ask for **sandbox test legal name + EIN** or **pre-provisioned org** so API work isn’t blocked on production KYC. |
| **Website** | Helper text allows **org profile on social** — use **https://trailblaize.net**, **LinkedIn company URL**, or public Instagram/X for Trailblaize. | Any stable public URL Crowded accepts. |
| **Registered business address** | **Principal place of business** or **registered agent** address from formation docs (often same as mail for small cos). Must be **street** (no P.O. box). | Crowded may allow a **known test address** in staging — confirm with Kyle; do **not** invent a fake real-world address if they require verifiable data. |

**Fastest unblock:** Email/slack **Kyle** (or **support@bankingcrowded.com**): *“We’re on staging Finish Setup; need either approved sandbox business details or a shortcut to complete customer provisioning for partner API testing (NO_CUSTOMER on accounts).”*

---

## Pass 3 — Collect / collection links (dues)

**Goal:** Dues → Crowded **collections** + **intents**; identify member-facing payment URL from **live** responses.

### API surface (from Postman collection + screenshots)

| Step | Method | Path | Notes |
|------|--------|------|--------|
| Create collection | `POST` | `/api/v1/chapters/:chapterId/collections` | Creates a collectable “fund” / campaign under a chapter. |
| Create intent | `POST` | `/api/v1/chapters/:chapterId/collections/:collectionId/intents` | Per-payer intent; body references `contactId`. |

**Create Collection — request body (raw JSON):**

```json
{
  "data": {
    "title": "Making Pizza 187",
    "requestedAmount": 50000
  }
}
```

- **`requestedAmount`:** Treat as **minor units (cents)** unless Crowded docs say otherwise — `50000` ⇒ **$500.00** for product logic / display.

**Create Collection — success status:** Sandbox returns **`201 Created`** (not `200`) when the collection is created.

**Create Intent — request body (raw JSON, verified Apr 2026):**

1. **`data` must be an object**, not an array. Using **`data: [ { contactId } ]`** triggers **400**:

   `"message": "\"data\" must be of type object"`.

2. With only **`contactId`** inside **`data`**, sandbox returns **400** `ValidationError`:

   `"message": "\"data.requestedAmount\" is required. payerIp is required. userConsented is required"`

3. Putting **`payerIp`** and **`userConsented`** as **siblings of `data`** (root of the JSON) still returns **400**:

   `"message": "payerIp is required. userConsented is required"`

   The API reads those fields **inside `data`**, not at the top level.

**Working shape (sandbox Apr 2026):**

```json
{
  "data": {
    "contactId": "00000000-0000-0000-0000-000000000000",
    "requestedAmount": 50000,
    "payerIp": "203.0.113.1",
    "userConsented": true
  }
}
```

| Field | Notes |
|--------|--------|
| **`data.contactId`** | Crowded contact UUID for the payer (from list / **GET contact**). |
| **`data.requestedAmount`** | **Minor units (cents)** — align with the collection / dues amount (often match **`Create Collection`** `requestedAmount`, e.g. `50000` = $500.00). |
| **`data.payerIp`** | **Inside `data`.** Use the **client’s public IPv4** in production; Postman may use a test IP (e.g. **`203.0.113.x`**) — confirm with Crowded if validation rejects certain ranges. |
| **`data.userConsented`** | **Inside `data`.** Boolean — set **`true`** only after your product records real **terms / payment consent** from the member. |

**Wrong shape (do not use):**

```json
{
  "data": [
    {
      "contactId": "00000000-0000-0000-0000-000000000000"
    }
  ]
}
```

If Crowded returns **400** with a different `message`, capture it and adjust — field names may be versioned.

### Verified sandbox responses (Apr 2026)

Redacted where useful for git; **IDs** match a real sandbox exercise.

**GET** `/api/v1/chapters/:chapterId/contacts/:contactId` — **200 OK**

Example `data` shape (single contact):

```json
{
  "data": {
    "id": "aecc6ddb-b3d7-406c-96af-418fb0a2fb42",
    "chapterId": "c651e8dd-a3b0-4756-91a0-30d18e22d714",
    "firstName": "Owen",
    "lastName": "Ridgeway",
    "mobile": "+1…",
    "email": "member@example.com",
    "dateOfBirth": "2006-01-05",
    "status": "Active",
    "createdAt": "2026-01-25T23:06:00.000Z",
    "updatedAt": "2026-01-26T13:51:32.000Z",
    "archivedAt": null
  }
}
```

**POST** `/api/v1/chapters/:chapterId/collections` — **201 Created**

Request (example):

```json
{
  "data": {
    "title": "Test dues collection",
    "requestedAmount": 50000
  }
}
```

Response — **`data.id`** is the **`collectionId`** for **Create Intent** path param:

```json
{
  "data": {
    "id": "442650b1-05e2-4d33-8417-3df879ed0a2e",
    "title": "Test dues collection",
    "requestedAmount": 50000,
    "goalAmount": null,
    "createdAt": "2026-04-08T22:32:37.305Z"
  }
}
```

**Notes:** No pay link on this response — the **member checkout URL** is on **Create Intent** **200** (**`data.paymentUrl`**), see below.

**POST** `/api/v1/chapters/:chapterId/collections/:collectionId/intents` — **200 OK**

Request (verified shape):

```json
{
  "data": {
    "contactId": "00000000-0000-0000-0000-000000000000",
    "requestedAmount": 50000,
    "payerIp": "203.0.113.1",
    "userConsented": true
  }
}
```

Response — **Member payment link:** **`data.paymentUrl`** (staging host **`staging.collect.crowdedme.xyz`**). Query param **`collectintentuuid`** matches **`data.id`**. **`successUrl`** / **`failureUrl`** were **`null`** in this sandbox call — confirm if Crowded accepts them on create when you need return URLs.

Example **`data`** shape (PII redacted; use real values in Postman only):

```json
{
  "data": {
    "id": "e2e1a7c2-a9cc-4759-b9d8-079b5227e024",
    "contactId": "00000000-0000-0000-0000-000000000000",
    "requestedAmount": 50000,
    "paidAmount": 0,
    "firstName": "Member",
    "lastName": "Example",
    "email": "member@example.com",
    "status": "Not Paid",
    "payments": [],
    "createdAt": "2026-04-08T22:44:13.891Z",
    "successUrl": null,
    "failureUrl": null,
    "paymentUrl": "https://staging.collect.crowdedme.xyz/collection/<collect-page-id>?collectintentuuid=<same-as-data.id>"
  }
}
```

### Findings — Pass 3

| Item | Notes |
|------|--------|
| Endpoint(s) | See table above. |
| Required IDs | `chapterId` → sandbox chapter UUID; `collectionId` → **`data.id`** from **Create Collection** response; `contactId` → **`data.id`** from **GET/LIST contacts**. |
| **Create Collection — live** | **Apr 2026 sandbox:** **201** with `data.id`, `title`, `requestedAmount`, `goalAmount`, `createdAt`. Earlier **401** *accept terms* may still apply to other orgs — resolve in portal / with Crowded if seen. |
| **Create Intent — body shape** | Single **`data`** object: **`contactId`**, **`requestedAmount`**, **`payerIp`**, **`userConsented`** (all inside **`data`** — root-level `payerIp` / `userConsented` are ignored). Not `data: [...]`. |
| **Member-facing URL field** | **`data.paymentUrl`** on **Create Intent** **200** — open in browser for checkout; **`collectintentuuid`** in query matches **`data.id`**. |

**Tickets:** TRA-414, TRA-415.

### Should we use Create Collection / Create Intent if Accounts or Contacts 403?

- **If 403 shows `No access to chapter chapter_id`:** That is almost always **misconfigured Postman path variables** (see [403 and literal chapter_id](#403-and-literal-chapter_id-in-path) above). **Fix `{{chapter_id}}` and the env value first** — Accounts, Contacts, and Collect all use the same `:chapterId` scope.
- **After paths resolve to a real UUID:** Run **`GET …/chapters/{{chapter_id}}/accounts`** — expect **200** (or **400 `NO_CUSTOMER`** if banking setup incomplete; that is different from 403).
- **Collect (Create Collection → Create Intent):** Same **`{{chapter_id}}`** requirement. **Create Collection** may still return **401** until **terms** are accepted (observed Mar 2026) — independent of **`NO_CUSTOMER`** on accounts. Resolve with Crowded/portal; then retry **POST collections** → **POST intents**.
- **Create Intent** needs a real **`contactId`** from Contacts APIs — complete **list/create contact** before intent, or the request will fail for missing/invalid contact.

**Recommended order after orgs + chapters work:** set `chapter_id` → **GET accounts** (or note `NO_CUSTOMER`) → **Contacts list** (set `contact_id` if needed) → **POST collection** → **POST intent**.

---

## Pass 4 — Webhooks

**Goal:** Signature + one event payload for `/api/webhooks/crowded`.

### Findings — Pass 4

| Item | Notes |
|------|--------|
| Event type(s) | |
| Signature approach | |
| Idempotency key | |

**Tickets:** TRA-416.

---

## Local codebase mapping

| Area | Notes |
|------|--------|
| Env | `CROWDED_API_BASE_URL=https://sandbox-api.crowdedfinance.com` (sandbox); Bearer token in env (e.g. `CROWDED_API_TOKEN`); webhook secret when known |
| Client | `lib/services/crowded/crowded-client.ts` — `Authorization: Bearer`, base URL from env; accounts list **unwrap** (`unwrapCrowdedAccountsListPayload`); **`normalizeCrowdedErrorDetails`** + safe `hasDetail` on `CrowdedApiError`; **collect:** `createCollection`, `getCollection`, `createIntent`, `getCrowdedIntentPaymentUrl` |
| Chapter ↔ Crowded IDs | `public.chapters.crowded_chapter_id`, `crowded_organization_id` (nullable UUIDs). Set per chapter per environment (e.g. Supabase SQL `UPDATE`). Maps Trailblaize `chapters.id` → Crowded path segment for `/api/v1/chapters/:chapterId/...`. |
| Resolver | `lib/services/crowded/chapterCrowdedMapping.ts` — `getCrowdedIdsForTrailblaizeChapter(supabase, trailblaizeChapterId)` returns `{ crowdedChapterId, crowdedOrganizationId }` or `null`. Use server-side with service role or RLS-safe client. |
| Types | `types/chapter.ts` — `Chapter` includes optional `crowded_chapter_id` / `crowded_organization_id`. |
| Test | `npm run test:crowded` — see [Local CLI smoke — TRA-412 full upsert](#local-cli-smoke--tra-412-full-upsert-path) for env sources (Supabase vs Postman). With smoke chapter id + service role: TRA-561 mapping + `listAccounts` + **`crowded_accounts` upsert** on **200**. |
| Account sync (TRA-412) | `lib/services/crowded/syncCrowdedAccounts.ts` — `upsertCrowdedAccountsFromList`, `syncCrowdedAccountsForTrailblaizeChapter`, `syncCrowdedAccountByIds`. |
| Unit tests | `npm run test:crowded:unit` — `crowded-client.accounts.test.ts` + `crowded-client.collections.test.ts` (bulk create, create collection / intent, `getCrowdedIntentPaymentUrl`). |
| DB (TRA-410 + TRA-561) | `chapters.crowded_*` mapping migration; `crowded_accounts` / `crowded_transactions` + RLS. **`20260408190000_crowded_account_id_to_text.sql`** — `crowded_account_id` **TEXT** on both tables (opaque Crowded ids). |
| Account → DB row | `lib/services/crowded/crowdedAccountMapping.ts` — `mapCrowdedAccountToSyncFields` for future sync jobs (balances assumed minor units; confirm with Crowded before production). |
| Supabase row types | `types/crowdedDb.ts` — `CrowdedAccountRow`, `CrowdedTransactionRow`. |
| Feature flag (TRA-411) | `types/featureFlags.ts` — `crowded_integration_enabled` (default **false**). `app/dashboard/feature-flags/page.tsx` — exec toggle. Persisted via existing chapter feature-flags API. |
| Crowded chapter API (auth) | `lib/services/crowded/resolveCrowdedChapterApiContext.ts` — Bearer/cookies + service role, `canManageChapterForContext`, flag + `crowded_chapter_id`. Used by bulk accounts + collections + intents routes. |
| Next routes (TRA-413 / 414) | `POST /api/chapters/[id]/crowded/accounts/bulk`, `POST …/crowded/collections` (**201**), `POST …/crowded/collections/[collectionId]/intents`. |

---

## Local CLI smoke — TRA-412 full upsert path

**Recent progress:** `npm run typecheck` and `npm run test:crowded:unit` need no Crowded/Supabase secrets. **`npm run test:crowded`** exercises Crowded with `.env.local`; it runs the **Supabase read + `crowded_accounts` upsert** when the variables below are set. Optional **GET single account** may log a **skipped** warning (Crowded 400) while the run still ends with **All requested checks passed** — see [Progress snapshot](#progress-snapshot--apr-2026-local-smoke-e2e).

### You do not get `CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID` from Postman

| Variable | Source |
|----------|--------|
| Postman **`{{chapter_id}}`** | **Crowded** chapter UUID from `GET /api/v1/chapters` — for Crowded URLs only. |
| **`CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID`** | **Trailblaize** `public.chapters.id` (PK of your app chapter). From **Supabase Table Editor**, or `SELECT id, name FROM public.chapters`, or internal admin tools. It is **not** exported from Postman as this name; it is your **own** database id. |
| **`crowded_chapter_id` on that row** | Set to the **same** UUID as Postman’s Crowded `chapter_id`, e.g. `UPDATE public.chapters SET crowded_chapter_id = 'c651e8dd-…' WHERE id = '<trailblaize chapters.id>';` so `getCrowdedIdsForTrailblaizeChapter` can resolve the Crowded API. |
| **`NEXT_PUBLIC_SUPABASE_URL`** | Supabase **Dashboard → Project Settings → API → Project URL**. |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Supabase **Dashboard → Project Settings → API → service_role** key (server-only; never commit). Lets the script read `chapters` and upsert `crowded_accounts`. |

### Steps

1. Apply migrations (`crowded_accounts`, `chapters.crowded_*`) on the DB you point at.
2. Choose a chapter; copy **`chapters.id`** → that value becomes **`CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID`** in `.env.local`.
3. Ensure that row has **`crowded_chapter_id`** = Crowded chapter UUID (from Postman **`GET /chapters`**).
4. Add **`NEXT_PUBLIC_SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** to `.env.local` (with existing `CROWDED_API_*`).
5. Run **`npm run test:crowded`**.

### Expected console output

- **`DB mapping smoke (TRA-561)`** and **`listContacts via DB mapping OK`** when mapping exists.
- **`TRA-412: crowded_accounts upsert OK — N row(s)`** when `listAccounts` returns **200** with accounts (and DB write succeeds).
- **`GET /chapters/…/accounts/:id skipped (Crowded error; list still OK)`** — expected in some sandboxes when single-GET path disagrees with list; upsert still runs from list.
- **`NO_CUSTOMER`** warning → no upsert; fix Crowded banking, rerun.
- If smoke chapter id **unset** → script skips the DB block; Crowded calls still use `CROWDED_TEST_CHAPTER_ID` or the first chapter from **`GET /chapters`**.
- **`0` accounts** with **200** → upsert runs with **N = 0** rows (still OK); check Crowded portal if you expected balances.

### Verify in Supabase

```sql
SELECT * FROM public.crowded_accounts
WHERE chapter_id = '<your Trailblaize chapters.id>';
```

---

## Implementation scan & follow-ups (Apr 2026)

**Linear — [Crowded Integration Strategy](https://linear.app/trailblaize/project/crowded-integration-strategy-6e845cc7474a/issues)** (project milestone *Foundation & Core Payment Migration*). Use this table when picking up work: **Done** items match what is in the repo today; **In Progress / Backlog** are the natural return points.

| Ticket | Title | Linear status (snapshot) | In codebase? |
|--------|--------|--------------------------|--------------|
| [TRA-409](https://linear.app/trailblaize/issue/TRA-409) | Env & API client | Done | Yes — `crowded-client`, `createCrowdedClientFromEnv`, `.env.example` |
| [TRA-561](https://linear.app/trailblaize/issue/TRA-561) | Chapter ↔ Crowded UUID stub | Done | Yes — columns + `chapterCrowdedMapping.ts` |
| [TRA-410](https://linear.app/trailblaize/issue/TRA-410) | DB: accounts + transactions | Done | Yes — migration `20260401181943_*`, types `crowdedDb.ts`, `docs/DATABASE_SCHEMA.md` |
| [TRA-411](https://linear.app/trailblaize/issue/TRA-411) | Feature flag | Done | Yes — `crowded_integration_enabled`, dashboard UI |
| [TRA-412](https://linear.app/trailblaize/issue/TRA-412) | Account management API methods | Done | `listAccounts` (unwrap + sync) proven in smoke; `getAccount` implemented but Crowded may reject list `id` on single GET — confirm with Crowded; `syncCrowdedAccounts.ts` upserts from **list** |
| [TRA-413](https://linear.app/trailblaize/issue/TRA-413) | Chapter account creation (bulk) | Done | **`bulkCreateAccounts`** + types/Zod/tests + optional bulk API route; Postman **200** ([Pass 2](#bulk-create-accounts--verified-sandbox-apr-2026)) |
| [TRA-414](https://linear.app/trailblaize/issue/TRA-414) | Collections + intents | Done | **`createCollection`**, **`getCollection`**, **`createIntent`**, **`getCrowdedIntentPaymentUrl`**; types + Zod; `crowded-client.collections.test.ts`; routes `POST …/crowded/collections`, `POST …/crowded/collections/[collectionId]/intents`; `resolveCrowdedChapterApiContext` shared with bulk accounts. |
| [TRA-415](https://linear.app/trailblaize/issue/TRA-415) | Dues `/api/dues/pay` Crowded path | **Verified manual E2E** (Apr 2026) | **`POST /api/dues/pay`** + member redirect to **staging Collect** confirmed. **`PATCH /api/dues/cycles/[id]`** + treasurer **Crowded checkout** card link `crowded_collection_id`. **`DuesClient` / `DuesStatusCard`**: shared Supabase browser client + **`duesEmbeds`** unwrap. **503** `ONLINE_DUES_UNAVAILABLE` when misconfigured; **Stripe fallback** not in repo. Migration `20260409120000_*`. **Post-pay DB sync still out of scope** until webhooks. |
| [TRA-416](https://linear.app/trailblaize/issue/TRA-416) | Webhook handler | Backlog | **Not implemented** — no `/api/webhooks/crowded` — **blocks closed-loop paid status in Trailblaize** |
| [TRA-417](https://linear.app/trailblaize/issue/TRA-417) | Treasurer balance UI | Backlog | **Partial:** Crowded link + dues cycles on **TreasurerDashboard**; full balances / **`GET …/accounts`** UI still **not implemented** |
| [TRA-418](https://linear.app/trailblaize/issue/TRA-418) | Payment sync service | Backlog | **Not implemented** — `crowded_transactions` table exists; no sync job |

**Revisit later (implementation notes)**

1. **TRA-412 — Done for list + DB sync:** `syncCrowdedAccountsForTrailblaizeChapter` / `upsertCrowdedAccountsFromList` validated end-to-end. **`syncCrowdedAccountByIds` / `getAccount`:** verify Crowded’s expected `:accountId` with Kyle if single-GET keeps failing. Use **NO_CUSTOMER** in treasurer UI ([TRA-417](https://linear.app/trailblaize/issue/TRA-417)).
2. **TRA-413 — Bulk create:** **Done** — `CrowdedClient.bulkCreateAccounts`, `types/crowded.ts`, `crowded-schemas.ts`, `crowded-client.accounts.test.ts`, `app/api/chapters/[id]/crowded/accounts/bulk/route.ts`.
3. **TRA-414 — Collections / intents:** **Done** — `createCollection`, `getCollection`, `createIntent`, `getCrowdedIntentPaymentUrl`; `resolveCrowdedChapterApiContext`; Next routes under `app/api/chapters/[id]/crowded/collections/…`.
4. **TRA-410 / sync — Use `mapCrowdedAccountToSyncFields`:** No cron or API route calls it yet; first sync should upsert `crowded_accounts` then populate `crowded_transactions` per TRA-418.
5. **TRA-411 — Gate server routes:** Flag exists in DB/UI; new Crowded routes use **`resolveCrowdedChapterApiContext`**; broader middleware TBD.
6. **Collections / dues / webhooks:** **Pass 3** pay URL on **`data.paymentUrl`**; **TRA-415** **manually verified** to staging Collect (Apr 2026 — see [App ↔ Crowded E2E](#app--crowded-e2e--manual-verification-apr-2026)); **next:** **TRA-416** webhooks + **TRA-418** sync for post-pay state.
7. **`CROWDED_VALIDATE_RESPONSES`:** Optional strict Zod on all responses — off by default; turn on when stabilizing schemas against production payloads.
8. **Later milestones** (e.g. TRA-423+): Expense/spending issues in Linear are **backlog**; no code in `lib/services/crowded` for cards/expenses yet.

---

## Session log

| When | What we did | Outcome |
|------|-------------|---------|
| Mar 2026 | Empty `base_url` → Cloud Agent host error | Fixed by setting env `base_url`. |
| Mar 2026 | `api.alpha.staging.crowded.me` | TLS handshake failure in some Postman setups. |
| Mar 2026 | Switched to `https://sandbox-api.crowdedfinance.com` + Bearer | **200** on `GET /api/v1/organizations`; org **Trailblaize** returned in `data`. |
| Mar 2026 | **Chapters Get all** | Recorded sandbox chapter `c651e8dd-…`, `organizationId`, vertical `SororitiesFraternities`. |
| Mar 2026 | **Accounts / Collect** (docs + Postman UI) | Documented `GET …/chapters/:id/accounts`; Collect: `POST …/collections` + `POST …/intents` + bodies; pay URL pending live 200. |
| Mar 2026 | Accounts **403** | Fixed: path variable `{{chapter_id}}` not literal `chapter_id`. |
| Mar 2026 | Accounts **400 NO_CUSTOMER** | Matches portal: bank/customer setup incomplete — user running **Finish setup** on staging portal. |
| Mar 2026 | Postman Desktop + env | **`chapter_id` left empty** and/or path param literal `chapter_id` → **403** `No access to chapter chapter_id`. Fix: `GET /chapters` → copy `id` into env; use **`{{chapter_id}}`** in Path Variables. Same pattern for **`{{contact_id}}`** on contact-by-id routes. |
| Mar 2026 | **Contacts** list + get by id | **200** with `{{chapter_id}}` + `{{contact_id}}`; literal `contact_id` in path → **404**. |
| Mar 2026 | **GET accounts** (correct UUID in path) | **400** `NO_CUSTOMER` — confirmed not a Postman placeholder bug; needs banking customer / portal setup. |
| Mar 2026 | **POST Create Collection** | **401** `"To proceed, please accept terms"` — block on Crowded terms / account state; ask Crowded where to accept for partner API. |
| Apr 2026 | **TRA-561 repo** | `chapters.crowded_*` columns + migration; `getCrowdedIdsForTrailblaizeChapter`; optional `CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID` in `npm run test:crowded`. |
| Apr 2026 | **Repo scan + Linear** | Documented shipped vs backlog: TRA-410/411 DB + flag; `listAccounts`/`getAccount` + account mapping helper + unit test; **Implementation scan & follow-ups** section added. |
| Apr 2026 | **Local CLI** | `typecheck` + `test:crowded:unit` pass; `test:crowded` passes Crowded org/chapters/contacts/accounts (accounts may be 0 rows); **Local CLI smoke — TRA-412** section documents full upsert env (Supabase vs Postman). |
| Apr 2026 | **Accounts list + DB** | Confirmed live **200** list; nested `data.data` unwrap; **`crowded_account_id` TEXT** migration; **`npm run test:crowded`** → **`crowded_accounts` upsert OK** with mapping smoke. |
| Apr 2026 | **`CrowdedApiError.details`** | Normalized string/array/object so `hasDetail` / NO_CUSTOMER checks never throw on variant API bodies. |
| Apr 2026 | **GET single account** | **400** `chapterId must be a positive integer` when using list `id` in path; smoke treats single GET as best-effort; sync uses list only. |
| Apr 2026 | **POST bulk create accounts** | Sandbox **200**: `product` ∈ `wallet` \| `perdiem` (not `checking`); success body includes `data.results[]` with `accountId`, `accountCreated`, `cardCreated`. Doc: [Bulk create — verified](#bulk-create-accounts--verified-sandbox-apr-2026). |
| Apr 2026 | **Pass 3 — Create Collection** | Sandbox **201**; response `data.id` = `collection_id`; no pay URL on this response. |
| Apr 2026 | **Pass 3 — Create Intent body** | **`payerIp`** / **`userConsented`** must live **inside `data`** (root-level siblings ignored → **400** *payerIp is required*). |
| Apr 2026 | **Pass 3 — Create Intent 200** | **`data.paymentUrl`** checkout link; `status` **Not Paid** until paid; `collectintentuuid` = intent `id`. |
| Apr 2026 | **App E2E — dues ↔ Collect** | Treasurer link `crowded_collection_id` + bulk assign + member **`POST /api/dues/pay`** → **`staging.collect.crowdedme.xyz`**; portal shows collection + contact collect request + emails. |
| Apr 2026 | **Member dues UI hardening** | `DuesClient` + `DuesStatusCard` use **`@/lib/supabase/client`** + **`lib/utils/duesEmbeds.ts`** (unwrap + safe due date). |
| Apr 2026 | **Post-pay** | Not automated — **TRA-416/418** backlog; success query param refetches only. |

---

## What to do manually next (in order)

1. **If `GET …/accounts` is still `NO_CUSTOMER`:** Complete **Finish setup** on [staging portal](https://staging.portal.crowdedme.xyz) until list returns **200**. *(If you already see upsert OK in smoke, treat this as done for that org.)*

2. **Crowded — confirm GET single account:** If product needs **`getAccount`**, ask **Kyle / Crowded** which identifier belongs in `…/accounts/:accountId` when list returns a numeric **`id`** (vs chapter UUID in path). Until then, **rely on list** for sync.

3. **Crowded / portal — if `POST …/collections` is still `401` (*accept terms*):** Same as before for orgs not yet unblocked. Once you see **201**, continue with **Create Intent** using **`data` as object** ([Pass 3](#pass-3--collect--collection-links-dues)).

4. **Postman env:** Keep **`chapter_id`**, **`contact_id`** (from list), **`base_url`**, **`api_token`** saved; path vars **`{{chapter_id}}`**, **`{{contact_id}}`** everywhere.

5. **Collect (app path — done Apr 2026):** In-app treasurer **link collection** + member **`/api/dues/pay`** → **staging Collect** verified ([App ↔ Crowded E2E](#app--crowded-e2e--manual-verification-apr-2026)). For **card testing**, use Crowded-supported methods on staging or **ACH** if shown; ask Crowded for official **test PANs** if cards decline.

6. **Optional:** If the collection has **GET** on a single collection, open it and note any `url` / `link` fields without paying.

7. **Pass 4 — Webhooks (highest product priority for “after pay”)**  
   Implement **[TRA-416](https://linear.app/trailblaize/issue/TRA-416)**: verify signature, idempotency, then update **`dues_assignments`** / ledger / profile fields from Crowded payment events. Until then, **Crowded portal** shows paid state; **Trailblaize** may still show unpaid after checkout.  
   - If no doc sample: email **Kyle** or **support@bankingcrowded.com** for: signature header + sample `payment.completed` (or equivalent) JSON.

8. **Local env (no commit)**  
   Crowded: `CROWDED_API_BASE_URL`, `CROWDED_API_TOKEN`. For **DB upsert smoke**, add Supabase URL, **service_role** key, and **`CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID`** = Trailblaize **`chapters.id`** (see [Local CLI smoke — TRA-412 full upsert path](#local-cli-smoke--tra-412-full-upsert-path)). **`scripts/test-crowded-api.ts`** uses Bearer via `createCrowdedClientFromEnv()`.

9. **Linear**  
   **TRA-415** member + treasurer handoff **verified on staging**. **Natural next focus:** **[TRA-416](https://linear.app/trailblaize/issue/TRA-416)** (webhooks) + **[TRA-418](https://linear.app/trailblaize/issue/TRA-418)** (transaction / payment sync) → then **[TRA-417](https://linear.app/trailblaize/issue/TRA-417)** (full treasurer financial UI). **Do not paste JWTs into Linear/GitHub** — describe status + error codes only.

---

## Screenshots that help Cursor (optional)

Share these in chat **with tokens blurred** or crop so secrets are not visible:

| # | What to capture | Why |
|---|-----------------|-----|
| 1 | **Chapters → Get all** — full response body (200) | Fill Pass 1 mapping + confirm field names. |
| 2 | **Accounts** — first successful list (or doc example) | Pass 2 + `crowded_accounts` shape. |
| 3 | **Collect** — request body + 200 response (redact PII) | Pass 3 + dues integration. |
| 4 | Environment editor showing **variable names only** (`base_url`, `api_token`) — values hidden | Confirms naming for code/env docs. |
| 5 | Any **401/403** with wrong base or auth | Debugging if regression. |
| 6 | **400** `NO_CUSTOMER` on accounts (correct chapter UUID in URL) | Documents banking-customer gap vs path bugs. |
| 7 | **401** `accept terms` on **POST collections** | Documents Collect gate before intents. |

---

*(Append new rows to **Session log** and tables after each pass.)*
