# Stripe Chapter Donations: Summary & User-Facing Updates

This document captures work on **Stripe Connect–backed chapter donation drives** (as opposed to Crowded Collect): webhook settlement, treasurer (Exec Admin) UI, and member dashboard behavior. It is intended for engineers and anyone writing release notes or QA checklists.

---

## Scope

- **Stripe Checkout** on the chapter **connected account** for **per-recipient** payment links created from Trailblaize.
- **Webhooks** (`checkout.session.completed`) that credit `donation_campaign_recipients` when session metadata matches the donation contract.
- **Treasurer UI** under **Administration → Manage → Dues** (donation campaigns panel).
- **Member UI** on the main **Dashboard** (“Donations for you”).

Schema and column-level detail live in `[docs/DATABASE_SCHEMA.md](../../DATABASE_SCHEMA.md)` (`donation_campaigns`, `donation_campaign_recipients`, `stripe_webhook_events`).

---

## Engineering summary (what was done)

### Webhook and settlement

- `**POST /api/webhooks/stripe`** verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`, then dispatches events through `handleStripeWebhookEvent`.
- On `**checkout.session.completed**`, when the session is a paid `payment` mode checkout and metadata includes `purpose=trailblaize_chapter_donation` plus chapter, campaign, recipient, and profile ids, `**applyStripeDonationCheckoutSessionCompleted**`:
  - Records idempotency in `**stripe_webhook_events**` (duplicate Stripe event ids are ignored).
  - Updates the matching `**donation_campaign_recipients**` row: `**amount_paid_cents**` (accumulated) and `**paid_at**`.

**Connect:** For checkouts created on a connected account, local testing requires forwarding **Connect** events (e.g. Stripe CLI `--forward-connect-to` pointing at the same webhook URL as `--forward-to`), and a signing secret that matches the listener.

### Per-recipient Checkout creation

- `**PATCH /api/chapters/[chapterId]/donations/campaigns/[campaignId]/share-link`** with `donationCampaignRecipientId` calls `**createStripeDonationRecipientCheckoutSession**`, which creates Checkout on the connected account and persists `**stripe_checkout_url**` and `**stripe_checkout_session_id**` on that recipient row. Those fields tie the completed session back to the correct recipient in the webhook.

### Campaign-level Payment Link (Stripe) — public / chapter hub

- When a Stripe-backed drive is created, a **Payment Link** is stored on `donation_campaigns.crowded_share_url`. New creates embed `payment_intent_data.metadata` (`purpose`, `trailblaize_donation_campaign_id`, `trailblaize_donation_settlement=payment_link_public`) so `checkout.session.completed` can record rows in **`donation_campaign_public_payments`** and roll totals into the chapter hub / treasurer progress (alongside per-recipient amounts).
- **Legacy Payment Links** (created before that metadata): webhook settlement can still match the session’s `payment_link` id to `metadata.stripe_payment_link_id` on the campaign.
- **Per-recipient Checkout** remains the path for crediting **`donation_campaign_recipients`** (named members / share table).

---

## User-facing updates (donations)

### Exec Admin / Treasurer — **Dues → Your donations**

When a chapter uses **Stripe-backed** donation drives (`stripe_price_id` set, no Crowded collection on that campaign):

Treasurers can optionally set a **description** and **hero image URL** (https) when creating a drive; those values appear in the expanded drive panel and on the member **Donations for you** card, and populate the Stripe Product (`description`, `images`) on Connect-backed creates.

1. **Create link (always available for Stripe rows)**
  Treasurers can generate (or refresh) a **Stripe Checkout** session **per shared member**. This is required for payments to **count toward that member** and the **drive goal** in Trailblaize.
2. **Open**
  Opens only the **per-recipient** checkout URL (`stripe_checkout_url` / `crowded_checkout_url` on the recipient row). The UI **no longer** uses the campaign-wide Stripe Payment Link as the **Open** target for Stripe drives, so treasurers are not steered toward a link that would skip in-app settlement.
3. **Progress toward goal**
  Shows total **amount received** from shared members (sum of settled `amount_paid_cents`) vs campaign **goal**, a **progress bar**, and a short summary (**paid count · shared count**).
4. **Recipient table**
  - **Amount received** — formatted from `amount_paid_cents`.  
  - **Paid on** — from `paid_at` when paid.  
  - **Status** — Paid / Not paid.  
  - **Refresh** — Manually reloads recipient rows (useful right after a test payment or webhook).
5. **Fresher data after payment**
  Recipient fetches use a more aggressive refresh strategy (including refetch while the drive is expanded and when returning to the tab) so the UI catches webhook updates without a long wait.

### Member — **Dashboard → Donations for you**

- If the treasurer has created a **per-recipient** Stripe checkout for you, **Open Stripe checkout** uses that `**stripe_checkout_url`** first (same session as Exec Admin **Open** for that row).
- If no per-recipient link exists yet, copy explains that the member should ask the treasurer to use **Create link** on their row (Stripe drives may still fall back to a campaign link only when no recipient URL exists; prefer **Create link** for correct tracking).
- Optional **description** and **hero image URL** (https) from `donation_campaigns` render on the card when the treasurer provided them at create time.

### Campaign copy and hero image (columns + API)

- `POST /api/chapters/[id]/donations/campaigns` accepts optional **`description`** (max 2000 chars) and **`heroImageUrl`** (https URL, max 2048 chars). Stored as `donation_campaigns.description` and `donation_campaigns.hero_image_url`.
- **Stripe Connect** creates: the same values are sent to the connected-account **Stripe Product** (`description`, `images[]`) for Checkout / Payment Link polish.
- **Crowded** creates: values are stored for Trailblaize UI only (Crowded API is unchanged).

---

## Local testing checklist (developers)

1. Install **Stripe CLI**, run `stripe login`.
2. Forward webhooks to the Next app, including Connect, for example:
  `stripe listen --forward-to http://localhost:3000/api/webhooks/stripe --forward-connect-to http://localhost:3000/api/webhooks/stripe`
3. Set `**STRIPE_WEBHOOK_SECRET`** in `.env.local` to the `**whsec_…**` printed by `stripe listen`; restart `npm run dev` after changes.
4. In **Dues**, expand a Stripe drive → **Create link** for a member → confirm in Supabase that `**stripe_checkout_session_id`** is set on `donation_campaign_recipients`.
5. Pay with test card **4242 4242 4242 4242**; confirm CLI shows `**checkout.session.completed`** → **200**; confirm `**paid_at`** / `**amount_paid_cents**` on the same recipient row and progress in the UI.

---

## Related code (quick reference)


| Area                    | Location                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Webhook route           | `app/api/webhooks/stripe/route.ts`                                                                          |
| Event dispatch          | `lib/services/stripe/handleStripeWebhookEvent.ts`                                                           |
| Donation settlement     | `lib/services/stripe/applyStripeDonationCheckoutSessionCompleted.ts`                                        |
| Create Checkout session | `lib/services/donations/createStripeDonationRecipientCheckoutSession.ts`                                    |
| Share-link API          | `app/api/chapters/[id]/donations/campaigns/[campaignId]/share-link/route.ts`                                |
| Treasurer panel         | `components/features/dashboard/admin/DonationCampaignsPanel.tsx`                                            |
| Recipients hook         | `lib/hooks/useDonationCampaignShare.ts`                                                                     |
| Member shares API       | `app/api/me/donation-campaign-shares/route.ts`, `lib/services/donations/myDonationCampaignSharesService.ts` |
| Member card             | `components/features/dashboard/dashboards/ui/MyDonationSharesCard.tsx`                                      |


---

## Branch / delivery note

Work described here has been developed and pushed on the `**feature/stripe-initial-integration**` branch. Merge via PR into `**develop**` per team workflow before production.