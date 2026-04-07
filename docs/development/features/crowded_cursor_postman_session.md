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

## Where we are (sandbox — verified Mar 2026; chapter-by-id re-verified Feb 2026)

Summary of what Postman **against `sandbox-api.crowdedfinance.com`** has proven so far (partner Bearer token, correct `{{chapter_id}}` / `{{contact_id}}` path vars):

| Step | Result | Notes |
|------|--------|--------|
| `GET /organizations` | **200** | Org `Trailblaize` + org UUID in `data`. |
| `GET /chapters` | **200** | Chapter UUID for `chapter_id` env; `organizationId` matches org. |
| `GET /chapters/{{chapter_id}}` (single chapter) | **200** | **Feb 2026:** Response wraps one chapter in **`data` as an object** (not an array). Extra fields vs list: `ein`, `masterChapterId`, `collectBalance`. Use **Authorization → Bearer `{{api_token}}`** on the request (or inherit from collection) and **Params → `chapterId` = `{{chapter_id}}`**. |
| `GET /chapters/{{chapter_id}}/contacts` | **200** | At least one contact; use `data[].id` as **`contact_id`**. |
| `GET /chapters/{{chapter_id}}/contacts/{{contact_id}}` | **200** | Single contact shape (`id`, `chapterId`, `firstName`, `lastName`, `email`, …). |
| `GET /chapters/{{chapter_id}}/accounts` | **400** *or* **200** | Historically **`NO_CUSTOMER`** until banking/portal setup complete. **After approval:** re-run with same path vars — expect **200** + account rows; update this row when confirmed in Postman. |
| `POST /chapters/{{chapter_id}}/collections` | **201** | **Apr 2026:** **`201 Created`** (not always `200`). Body → `data.id` = **`collection_id`** for intents. Fields: `title`, `requestedAmount`, `goalAmount`, `createdAt`. Prior blocker was **401** accept terms — see [Pass 3](#pass-3--collect--collection-links-dues) history. |
| `POST …/collections/…/intents` | **400** *fixable* | **Apr 2026:** **`ValidationError`**: `"data" must be of type object` when body used **`data` as an array** (legacy Postman sample). Use **`data` as a single object** with `contactId` — see [Pass 3](#pass-3--collect--collection-links-dues). |

**Implication for app work:** **Collections** flow is live in sandbox (**201**); implement **`createCollection`** expecting **201**. **Intents:** send JSON `data: { contactId }` (object). **Accounts** — still re-verify **`GET …/accounts`** as needed (**200** vs **`NO_CUSTOMER`**).

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
| Chapter fields (live **GET /chapters** list sample) | `name` may be `null`; `organization` = display string (`Trailblaize`); `organizationId` links to org; `status` (e.g. `Active`); `businessVertical` (e.g. `SororitiesFraternities`); `createdAt`. |
| **GET /chapters/:chapterId** (single) — Feb 2026 | Same core fields as list item, plus typically **`ein`** (string), **`masterChapterId`** (UUID; matched `id` in sample), **`collectBalance`** (number, minor units or platform-defined — confirm with Crowded docs). **`data` is a single object**, not `data[]`. |
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

**GET single chapter — live shape (Feb 2026, sandbox):** `GET {{base_url}}/api/v1/chapters/{{chapter_id}}` → **200**. `ein` is sensitive — **do not paste full EIN** into Slack/Git; redact in copies.

```json
{
  "data": {
    "id": "c651e8dd-a3b0-4756-91a0-30d18e22d714",
    "name": null,
    "organization": "Trailblaize",
    "organizationId": "c1f85333-2782-478d-97d3-458e3420cecf",
    "status": "Active",
    "businessVertical": "SororitiesFraternities",
    "ein": "<redacted>",
    "createdAt": "2026-01-25T21:38:18.000Z",
    "masterChapterId": "c651e8dd-a3b0-4756-91a0-30d18e22d714",
    "collectBalance": 0
  }
}
```

**Postman env tip:** Add variable **`chapter_id`** = the UUID from **`GET /chapters`** → `data[].id` (historical sandbox example: `c651e8dd-a3b0-4756-91a0-30d18e22d714`). Re-copy after new sandbox data if IDs change.

**Path variables (critical):** For any request with `:chapterId` in the URL, open the **Params** tab → **Path Variables** → set **`chapterId`** to **`{{chapter_id}}`** (with double curly braces). If the value is the plain text `chapter_id` or an empty cell, the API receives the literal string `chapter_id` and returns **403** — see troubleshooting below.

### 401 — “API token has been revoked or is invalid” while `GET /organizations` works

Usually the **failing request is not sending Bearer** the same way as **Organizations → Get all**.

| Check | Action |
|--------|--------|
| **Authorization tab** on the failing request | Use **Inherit auth from parent** or **Bearer Token** = **`{{api_token}}`** (match the working org request). |
| **Path variable** | **`chapterId` = `{{chapter_id}}`**, not the literal string `chapter_id`. |
| **Console** | **View → Show Postman Console** → confirm `Authorization: Bearer` is sent and URL contains a real UUID in `/chapters/<uuid>/…`. |

If auth + path are correct and **401** persists, refresh **`api_token`** in the environment (Crowded may have rotated the JWT).

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
| **Response shape** (list; live **200** TBD) | Each item: `id`, `name`, `status`, `accountNumber`, `routingNumber`, `currency`, `balance`, `hold`, `available`, `contactId`, `createdAt`. Doc/example used placeholders `account_id` / `contact_id` — replace with real IDs from sandbox when testing. |
| **Live error (path correct)** | **400** `ResourceInputSafeError`, `details: ["NO_CUSTOMER"]`, message `"No customer was found for operation"` — chapter/org exists but **banking customer** not provisioned (portal **Finish setup** or Crowded support). |
| **Fields to persist (app)** | `crowded_account_id` ← `id`; link to our `chapter_id`; optional cache: `status`, `currency`, balances; `contactId` if we sync contacts. **Do not** store full account/routing in logs; treat as sensitive in UI. |
| **Create** | Collection includes **POST Bulk create accounts** — run only when ready; not filled here. |

**Tickets:** TRA-412, TRA-413, TRA-410.

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

**Create Collection — live response (Apr 2026, sandbox):** **`201 Created`**. Save **`data.id`** into Postman env as **`collection_id`** for the intent call.

```json
{
  "data": {
    "id": "098afa01-c056-4e78-ac3c-c361e6d2df12",
    "title": "Making Pizza 102",
    "requestedAmount": 50000,
    "goalAmount": null,
    "createdAt": "2026-04-07T23:39:57.649Z"
  }
}
```

*(IDs/titles are examples; use your response’s `data.id`.)*

**Create Intent — request body (raw JSON) — corrected Apr 2026**

The API validates **`data` as an object**, not an array. A body like `"data": [ { "contactId": "…" } ]` returns **400** `ValidationError`: **`"data" must be of type object`**.

Use:

```json
{
  "data": {
    "contactId": "{{contact_id}}"
  }
}
```

- **Body tab:** **raw** → **JSON**; ensure **`Content-Type: application/json`** (Postman usually sets it).
- Replace **`{{contact_id}}`** with a real **Crowded contact** UUID from **`GET …/contacts`** (`data[].id`).

**Legacy / wrong shape (do not use):**

```json
{
  "data": [{ "contactId": "…" }]
}
```

### Findings — Pass 3

| Item | Notes |
|------|--------|
| Endpoint(s) | See table above. |
| Required IDs | `chapterId` → `{{chapter_id}}`; **`collectionId` → `{{collection_id}}`** from **Create Collection** `data.id`; `contactId` inside JSON body from Contacts. |
| **Create Collection — history** | **Mar 2026:** **401** `"To proceed, please accept terms"` until portal/compliance resolved. **Apr 2026:** **201 Created** verified after banking/terms unblocked. |
| **Create Intent — Apr 2026** | **400** if `data` is an **array** — use **`data` as object** (see above). If a new error appears after fixing shape, record `type`, `message`, `requestId`. |
| **Member-facing URL field** | **Still TBD** — not present on create-collection sample above; check **GET collection** (if available) or intent/checkout response after intent succeeds. |

**Tickets:** TRA-414, TRA-415.

### Should we use Create Collection / Create Intent if Accounts or Contacts 403?

- **If 403 shows `No access to chapter chapter_id`:** That is almost always **misconfigured Postman path variables** (see [403 and literal chapter_id](#403-and-literal-chapter_id-in-path) above). **Fix `{{chapter_id}}` and the env value first** — Accounts, Contacts, and Collect all use the same `:chapterId` scope.
- **After paths resolve to a real UUID:** Run **`GET …/chapters/{{chapter_id}}/accounts`** — expect **200** (or **400 `NO_CUSTOMER`** if banking setup incomplete; that is different from 403).
- **Collect (Create Collection → Create Intent):** Same **`{{chapter_id}}`** requirement. **Create Collection** returns **201** when unblocked; store **`collection_id`**. **Create Intent** needs **`data`: object** with **`contactId`** (not `data`: array); see corrected body in Pass 3.
- **Create Intent** needs a real **`contactId`** from Contacts APIs — complete **list/create contact** before intent, or the request will fail for missing/invalid contact.

**Recommended order after orgs + chapters work:** set `chapter_id` → **GET accounts** (or note `NO_CUSTOMER`) → **Contacts list** (set `contact_id` if needed) → **POST collection** → **POST intent**.

---

## Next steps in Postman (after chapter GET 200)

Use this order; record status + **redacted** JSON in **Session log** when a step changes.

1. **`GET …/chapters/{{chapter_id}}/accounts`** — Confirm **200** + account row(s) now that banking is live; if **400** + `NO_CUSTOMER`, note requestId and compare with portal **Accounts** / **Bank Verification**.
2. **`GET …/chapters/{{chapter_id}}/contacts`** — Refresh **`contact_id`** from `data[0].id` if needed for intents.
3. **`POST …/chapters/{{chapter_id}}/collections`** — Same Bearer + `{{chapter_id}}`. If **401** `"accept terms"`, use **Compliance** / portal support. On success expect **`201 Created`**; set env **`collection_id`** = response **`data.id`** (see Pass 3).
4. **`POST …/collections/…/intents`** — Path: **`collectionId`** = **`{{collection_id}}`**. Body: **`data` as object** `{ "contactId": "{{contact_id}}" }` (not an array). **Body** → raw JSON.
5. **Optional:** Any **GET collection by id** in the collection — note `url` / `link` fields for member checkout.
6. **`npm run test:crowded`** — Keep CLI smoke aligned with Postman (env chapter UUID + token).

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
| Client | `lib/services/crowded/crowded-client.ts` — `Authorization: Bearer`, base URL from env |
| Test | `npm run test:crowded` — Bearer + sandbox base (TRA-409); optional DB mapping smoke via `CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID` |

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
| Feb 2026 | **Chapters → Get** (`GET …/chapters/:chapterId`) | **200** with `ein`, `masterChapterId`, `collectBalance`; fixed **401** by **Bearer `{{api_token}}`** on request + **`chapterId` = `{{chapter_id}}`** (not literal `chapter_id`). |
| Feb 2026 | **Doc** | Added single-chapter JSON sample (EIN redacted), 401 troubleshooting table, **Next steps in Postman** checklist. |
| Apr 2026 | **POST Create Collection** | **201 Created**; response includes `data.id`, `title`, `requestedAmount`, `goalAmount`, `createdAt`. |
| Apr 2026 | **POST Create Intent** | **400** `ValidationError`: `"data" must be of type object` when using **`data` array**; fix: **`data`: single object** with `contactId` (documented in Pass 3). |

---

## What to do manually next (in order)

1. **Crowded / portal — unblock accounts (`NO_CUSTOMER`):** Complete **Finish setup** on [staging portal](https://staging.portal.crowdedme.xyz) (or get sandbox provisioning from Crowded) until **`GET …/accounts`** returns **200** with rows. See [portal section](#crowded-staging-portal--finish-setup-brief).

2. **Collect:** **`POST …/collections`** now **`201`** when unblocked. If **401** terms appears again (new env/token), use **Compliance** / support.

3. **Postman env:** Keep **`chapter_id`**, **`contact_id`**, **`collection_id`** (from create-collection **`data.id`**), **`base_url`**, **`api_token`**; path vars **`{{chapter_id}}`**, **`{{collection_id}}`**, **`{{contact_id}}`** as needed.

4. **Collect — intents:**  
   - **POST Create Intent** with body **`{ "data": { "contactId": "<uuid>" } }`** (object, not array).  
   - On success, document **member payment / checkout URL** (or next-step field) in **Findings — Pass 3**.

5. **Optional:** If the collection has **GET** on a single collection, open it and note any `url` / `link` fields without paying.

6. **Pass 4 — Webhooks**  
   If the collection has example webhooks, save a redacted sample.  
   - Otherwise email **Kyle** or **support@bankingcrowded.com** for: signature header name + verification steps + sample `payment.completed` (or equivalent) JSON.

7. **Local env (no commit)**  
   Add to **`.env.local`** (values stay private):  
   - `CROWDED_API_BASE_URL=https://sandbox-api.crowdedfinance.com`  
   - `CROWDED_API_TOKEN=<your sandbox JWT>`  
   `scripts/test-crowded-api.ts` uses **Bearer** via `createCrowdedClientFromEnv()`.

8. **Linear**  
   Use **[Next steps in Postman (after chapter GET 200)](#next-steps-in-postman-after-chapter-get-200)** for API verification; track **TRA-412** / **TRA-414** as code catches up. **Do not paste JWTs or full EIN into Linear/GitHub** — describe status + error codes only.

---

## Screenshots that help Cursor (optional)

Share these in chat **with tokens blurred** or crop so secrets are not visible:

| # | What to capture | Why |
|---|-----------------|-----|
| 1 | **Chapters → Get all** — full response body (200) | Fill Pass 1 mapping + confirm field names. |
| 2 | **Accounts** — first successful list (or doc example) | Pass 2 + `crowded_accounts` shape. |
| 3 | **Collect** — create collection **201** + intent request/response (redact PII) | Pass 3 + dues integration. |
| 4 | Environment editor showing **variable names only** (`base_url`, `api_token`) — values hidden | Confirms naming for code/env docs. |
| 5 | Any **401/403** with wrong base or auth | Debugging if regression. |
| 6 | **400** `NO_CUSTOMER` on accounts (correct chapter UUID in URL) | Documents banking-customer gap vs path bugs. |
| 7 | **401** `accept terms` on **POST collections** | Documents Collect gate before intents. |

---

*(Append new rows to **Session log** and tables after each pass.)*
