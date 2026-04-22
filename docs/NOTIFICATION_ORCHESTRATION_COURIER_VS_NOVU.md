# Notification orchestration: Courier vs Novu

This document compares **Courier** and **Novu** as optional **notification infrastructure** layers on top of Trailblaize’s current stack. It is meant for engineering and product planning—not a vendor contract or pricing quote.

**Related:** [SMS delivery hardening roadmap](./SMS_DELIVERY_HARDENING_ROADMAP.md) (Phases 0–6), [Architecture](./ARCHITECTURE.md).

---

## Current Trailblaize setup (baseline)

| Layer | Today |
|--------|--------|
| **App** | Next.js 15 (App Router), API routes |
| **Data** | Supabase — profiles, `sms_consent`, `push_subscriptions`, chapter scoping |
| **SMS** | Telnyx — `lib/services/sms/smsServiceTelnyx.ts`, webhooks `app/api/webhooks/telnyx/` |
| **Email** | SendGrid — `lib/services/emailService.ts`, template IDs in env |
| **Push** | OneSignal REST — `lib/services/oneSignalPushService.ts` |

**Goal of adding orchestration:** one conceptual place for **multi-channel sends**, **routing / fallbacks** (e.g. SMS failed → email), **templates / workflows**, **delivery visibility**, and **idempotent retries**—without replacing Supabase as the **source of truth** for users, consent, and chapter membership.

---

## What integrating either platform *does* for us

| Capability | Without orchestration | With Courier / Novu |
|------------|------------------------|-------------------|
| **Send API** | Separate calls to Telnyx, SendGrid, OneSignal | One **orchestrated** send path per “notification type” |
| **Channel order & fallback** | Hand-coded in each feature | **Workflow / routing** (e.g. try push → SMS → email) |
| **Templates** | SendGrid dynamic templates + string-built SMS | Central templates (migrate gradually from SendGrid) |
| **Logs & timelines** | Split across Telnyx portal, SendGrid, OneSignal | **Unified activity** in vendor dashboard (plus optional webhooks to our DB) |
| **Bulk / fan-out** | Custom batching (`sendBulkSMS`), Vercel timeouts | Vendor **bulk jobs** or workflow triggers (still need sensible rate limits) |
| **Preferences / topics** | Our DB + ad hoc checks | Vendor **subscription topics** (must stay in sync with Supabase consent) |
| **Compliance** | Our copy + 10DLC | Same legal burden; **Telnyx + SendGrid** still carry messages—we add **sync** and **double-truth** risk if not careful |

**Important:** Neither product removes **carrier** SMS filtering or **guarantees** handset delivery. They improve **operations, routing, and observability**—aligned with the “enterprise” definition in the SMS roadmap.

---

## Courier

**Positioning:** “Infrastructure for product-to-user communication” — email, SMS, push, chat, in-app from **one send API**, with dashboard templates and routing.

**Official references:**

- [Telnyx SMS integration](https://www.courier.com/docs/external-integrations/sms/telnyx) — Telnyx API key + originating number; recipient `phone_number`; optional `message.providers.telnyx.override` for advanced control.
- [SendGrid (email)](https://www.courier.com/docs/external-integrations/email/sendgrid.md)
- [OneSignal Push](https://www.courier.com/docs/external-integrations/push/onesignal-push.md)
- [OneSignal Email](https://www.courier.com/docs/external-integrations/email/onesignal-email.md) (if consolidating email through OneSignal is ever desired)
- [Courier docs index / LLM-oriented overview](https://www.courier.com/docs/llms.txt) — data model: `message → routing (single | all) → channel → provider`; bulk is a **3-step** job (create → add users → run).
- [Pricing](https://www.courier.com/pricing) — tiers include free/developer volume and usage-based business pricing; enterprise is custom (verify current page before budgeting).

### How Courier maps to Trailblaize

- **Telnyx:** First-class integration — fits **keeping current 10DLC / messaging profile** ([Telnyx setup](https://www.courier.com/docs/external-integrations/sms/telnyx)).
- **SendGrid:** Native email provider — can **reuse** domain authentication and migrate templates over time.
- **Push:** **OneSignal Push** is documented as a provider — aligns with existing `oneSignalPushService` / `push_subscriptions` (migration path: sync device tokens into Courier profiles or continue pushing via OneSignal behind Courier, depending on integration style).
- **Routing:** `routing.method: "single"` = **fallback chain**; `"all"` = parallel to every channel ([sending model in docs index](https://www.courier.com/docs/llms.txt)). Default should usually be `"single"` for “try A then B on failure.”
- **Multi-tenant / chapters:** Docs describe **`tenant_id`** for multi-tenant scope (brands, preferences, routing) — relevant for **per-chapter** branding or isolation if we invest in mapping `chapter_id` → tenant.
- **Idempotency:** Docs recommend **`Idempotency-Key`** header on transactional sends — matches our need for announcement retries without double-send.
- **Bulk:** Explicit **3-step bulk API** — good for **100+ recipients** if we move fan-out off the hot HTTP path.

### Courier — pros

| Pro | Detail |
|-----|--------|
| **Telnyx + SendGrid + OneSignal Push** in one vendor’s integration catalog | Strong fit for **not ripping out** existing providers ([Telnyx](https://www.courier.com/docs/external-integrations/sms/telnyx), [SendGrid](https://www.courier.com/docs/external-integrations/email/sendgrid.md), [OneSignal Push](https://www.courier.com/docs/external-integrations/push/onesignal-push.md)). |
| **Fallback routing & resilience** | Documented failover, retries, delivery pipeline ([docs index](https://www.courier.com/docs/llms.txt) links to failover / resilience guides). |
| **Mature SaaS** | SSO, enterprise features, EU datacenter option per pricing page; less ops burden than self-hosting. |
| **DX** | Official SDKs, CLI, MCP for agents ([quickstart](https://www.courier.com/docs/guides/getting-started/overview)). |
| **In-app inbox channel** | `courier/inbox` without a third-party email/SMS provider for in-product feeds ([docs index](https://www.courier.com/docs/llms.txt)). |

### Courier — cons

| Con | Detail |
|-----|--------|
| **SaaS lock-in & cost** | Usage scales with volume; enterprise features are gated ([pricing](https://www.courier.com/pricing)). |
| **Not self-hosted** | Data flows through Courier cloud (unless enterprise offers specific arrangements—confirm with sales). |
| **Dual source of truth** | Profiles in Courier vs `profiles` in Supabase — requires **sync discipline** and webhooks back for critical state. |
| **Bulk complexity** | Three-step bulk flow is powerful but must be implemented correctly ([docs index](https://www.courier.com/docs/llms.txt)). |
| **`PUT` vs `POST` profiles** | Full profile replace on `PUT` is a footgun; team must standardize on merge `POST` ([docs index](https://www.courier.com/docs/llms.txt)). |

---

## Novu

**Positioning:** Open **notification infrastructure** — workflows, subscribers, channels (email, SMS, push, in-app, chat), GUI + code-based workflows, **Inbox** UI components.

**Official references:**

- [Novu platform overview](https://docs.novu.co/platform) — workflows, subscribers, integrations, Inbox.
- [Telnyx SMS provider](https://docs.novu.co/platform/integrations/sms/telnyx) — API key, **messaging profile ID**, from address; connect via Novu dashboard integrations.
- [Self-hosted vs Novu Cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud) — feature matrix (SSO, RBAC, SOC2/HIPAA, activity retention, env vars, etc.).

### How Novu maps to Trailblaize

- **Telnyx:** Documented provider — API key, **Telnyx messaging profile ID**, E.164 from address ([Novu Telnyx](https://docs.novu.co/platform/integrations/sms/telnyx)).
- **Email / push:** Novu supports **Email, SMS, In-app, Chat, Push** on both self-hosted and cloud per [comparison matrix](https://docs.novu.co/community/self-hosted-and-novu-cloud); **specific** provider (SendGrid, FCM, OneSignal, etc.) is chosen per integration in the dashboard — confirm exact **SendGrid** and **OneSignal** connectors for your edition before committing.
- **Workflows:** GUI + framework-based workflows and **digest** — good for journey-style “bundle then send.”
- **Inbox:** Bell / Inbox components — optional replacement or supplement for custom in-app notification UI.
- **Hosting:** **Community self-hosted** vs **Novu Cloud** — security/compliance (SAML, MFA, SOC2, HIPAA BAA) skew heavily to **Cloud** per [matrix](https://docs.novu.co/community/self-hosted-and-novu-cloud).

### Novu — pros

| Pro | Detail |
|-----|--------|
| **Open-source core** | Inspectability, community, optional **self-host** for cost/control ([self-hosted vs cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud)). |
| **Telnyx** as SMS provider | Documented setup ([Telnyx](https://docs.novu.co/platform/integrations/sms/telnyx)). |
| **Unified workflows + Inbox** | Strong story for **in-app + multi-channel** in one product ([platform](https://docs.novu.co/platform)). |
| **Novu Cloud** | Enterprise compliance and ops “easy button” if self-host is not desired ([matrix](https://docs.novu.co/community/self-hosted-and-novu-cloud)). |

### Novu — cons

| Con | Detail |
|-----|--------|
| **Self-hosted operational cost** | You run databases, scaling, upgrades; **SSO/RBAC/SOC2** are **not** on par with Cloud on community self-hosted ([matrix](https://docs.novu.co/community/self-hosted-and-novu-cloud)). |
| **Feature split** | Activity retention, multiple environments, env vars — **Cloud-biased**; self-hosted limits vary ([matrix](https://docs.novu.co/community/self-hosted-and-novu-cloud)). |
| **Community vs enterprise reality** | Public issues discuss self-host deployment friction — **pilot** self-host before betting the business on it. |
| **Provider matrix** | Must validate **SendGrid + OneSignal push** together on chosen tier; not as centrally documented in one page as Courier’s llms index. |

---

## Side-by-side summary

| Dimension | Courier | Novu |
|-----------|---------|------|
| **Telnyx SMS** | [Documented](https://www.courier.com/docs/external-integrations/sms/telnyx) | [Documented](https://docs.novu.co/platform/integrations/sms/telnyx) |
| **SendGrid** | [Documented email integration](https://www.courier.com/docs/external-integrations/email/sendgrid.md) | Supported via Novu email providers (confirm in dashboard / docs for your plan) |
| **OneSignal Push** | [Documented](https://www.courier.com/docs/external-integrations/push/onesignal-push.md) | Typically via push provider integration (confirm for Cloud vs self-hosted) |
| **Self-host** | No (managed SaaS) | Yes — [community self-hosted](https://docs.novu.co/community/self-hosted-and-novu-cloud) + Novu Cloud |
| **Bulk / scale** | [3-step bulk API](https://www.courier.com/docs/llms.txt) | Workflows + infrastructure limits per deployment |
| **Fallback / retries** | First-class in product docs | Platform-dependent; verify current Novu retry/digest behavior for each channel |
| **Multi-tenant / chapters** | `tenant_id` in Courier model ([docs index](https://www.courier.com/docs/llms.txt)) | Map `chapter_id` / segments in subscriber metadata or workflows (design choice) |
| **Best fit if…** | You want **managed** orchestration with **minimal** change to Telnyx + SendGrid + OneSignal | You want **open source**, optional self-host, or **Inbox**-centric UX with Novu Cloud for compliance |

---

## Recommendation (engineering view)

1. **Do not skip internal hardening** — Implement [SMS_DELIVERY_HARDENING_ROADMAP.md](./SMS_DELIVERY_HARDENING_ROADMAP.md) **Phases 1–2** (per-recipient `telnyx_id`, webhook verification, structured errors). Orchestration **amplifies** bad telemetry if the foundation is weak.

2. **If the priority is “one vendor, keep Telnyx + SendGrid + OneSignal” with minimal research risk:** **Courier** has the clearest **documented trifecta** ([Telnyx](https://www.courier.com/docs/external-integrations/sms/telnyx), [SendGrid](https://www.courier.com/docs/external-integrations/email/sendgrid.md), [OneSignal Push](https://www.courier.com/docs/external-integrations/push/onesignal-push.md)).

3. **If the priority is open-source, self-host, or deep Inbox embedding:** **Novu** is a strong candidate—run a **time-boxed spike** (self-host or Cloud trial) with **Telnyx + SendGrid + push** on the same workflow, and validate **compliance** needs against [self-hosted vs cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud).

4. **Neither replaces** Supabase for **consent and membership** — design **sync**: e.g. on profile update, merge Courier/Novu subscriber; on `sms_consent` false, update vendor + handle inbound STOP via existing Telnyx webhook.

---

## Plan moving forward (suggested phases)

| Phase | Action |
|-------|--------|
| **A — Foundation** | Complete SMS roadmap Phases 1–2; optional Phase 3 queue for large announcement sends. |
| **B — Pilot** | Create **sandbox** Courier *or* Novu workspace; wire **one** low-risk notification (e.g. developer test) through orchestrator alongside legacy path. |
| **C — Channel parity** | Migrate **one** production flow (e.g. single-recipient event reminder) with **idempotency keys** and compare logs to current Telnyx/SendGrid. |
| **D — Fallback journey** | Implement **single** routing chain: e.g. push → SMS → email for **one** use case; measure delivery and support tickets. |
| **E — Bulk / announcements** | Use Courier bulk job API *or* Novu workflow + rate limits aligned with Telnyx / 10DLC; keep chapter scoping in Supabase. |
| **F — Deprecation** | Gradually retire direct `sendSMS` / duplicate template paths only when parity and runbooks exist. |

---

## Action checklist before vendor PO

- [ ] Confirm **SendGrid** domain + template strategy (reuse vs rebuild in vendor UI).
- [ ] Confirm **OneSignal** player IDs vs Courier/Novu device token model.
- [ ] Legal / DPA: where PII flows (US vs EU), subprocessors, retention.
- [ ] **Cost model** at 2× / 10× current monthly notification volume.
- [ ] **Runbook:** “Orchestrator says sent but user got nothing” — still ends in Telnyx / SendGrid / OneSignal provider logs.

---

## Document control

| Field | Value |
|-------|--------|
| **Created** | 2026-04-22 |
| **Owner** | Engineering (update after pilot or vendor choice) |
| **Next review** | After SMS Phase 2 complete or when starting orchestration pilot |
