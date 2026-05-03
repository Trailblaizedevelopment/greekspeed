# Database Schema Documentation

## Overview
Trailblaize uses Supabase (PostgreSQL) as its database. This document outlines the key tables, relationships, and common query patterns.

## Core Tables

### `profiles`
User profiles - the central user table.

**Key Columns:**
- `id` (UUID, Primary Key) - References Supabase Auth users
- `full_name` (TEXT)
- `first_name` (TEXT, nullable)
- `last_name` (TEXT, nullable)
- `email` (TEXT, nullable)
- `phone` (TEXT, nullable)
- `avatar_url` (TEXT, nullable)
- `banner_url` (TEXT, nullable)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `chapter_role` (TEXT, nullable) - e.g., "president", "treasurer"
- `member_status` (TEXT) - "active", "alumni", etc.
- `bio` (TEXT, nullable)
- `location` (TEXT, nullable)
- `username` (TEXT, nullable)
- `profile_slug` (TEXT, nullable)
- `onboarding_completed` (BOOLEAN, default: false)
- `onboarding_completed_at` (TIMESTAMPTZ, nullable)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `chapters` via `chapter_id`
- Has many `posts` via `author_id`
- Has many `post_comments` via `author_id`
- Has many `post_likes` via `user_id`
- Has many `comment_likes` via `user_id`

**Common Queries:**
```typescript
// Get user profile with chapter info
const { data } = await supabase
  .from('profiles')
  .select('*, chapters(*)')
  .eq('id', userId)
  .single();

// Get all members of a chapter
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('chapter_id', chapterId)
  .eq('member_status', 'active');
```

### `chapters`
Greek life chapters (fraternities/sororities). **`public.chapters` is a VIEW** over `public.spaces` (`WITH (security_invoker = true)`), exposing a chapter-shaped column set. Physical row data (including Crowded ids, `feature_flags`, and Stripe Connect donation columns from **TRA-683**) lives on **`public.spaces`**; the API still queries `chapters` for compatibility.

**Key Columns (via view; stored on `spaces` unless noted):**
- `id` (UUID, Primary Key)
- `name` (TEXT)
- `type` (TEXT) - "fraternity" or "sorority"
- `university` (TEXT, nullable)
- `founded_year` (INTEGER, nullable)
- `crowded_chapter_id` (UUID, nullable) — Crowded API chapter identifier for this row (sandbox vs production per environment); used for chapter-scoped Crowded calls (e.g. contacts, accounts)
- `crowded_organization_id` (UUID, nullable) — optional Crowded organization UUID for org-level API calls
- `feature_flags` (JSONB) — chapter toggles including `stripe_donations_enabled` (Stripe Connect donations, **TRA-683**); see `types/featureFlags.ts`
- `stripe_connect_account_id` (TEXT, nullable) — Stripe Connect account id (`acct_…`) when the chapter completes Express onboarding
- `stripe_connect_details_submitted` (BOOLEAN, default false) — cached mirror of Stripe Account `details_submitted`
- `stripe_charges_enabled` (BOOLEAN, default false) — cached mirror of Stripe Account `charges_enabled` (gates treasurer Stripe donation setup)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Relationships:**
- Has many `profiles` via `chapter_id`
- Has many `posts` via `chapter_id`
- Has many `events` via `chapter_id`
- Has many `crowded_accounts` via `chapter_id`

### `crowded_accounts`
Synced Crowded banking accounts per chapter (TRA-410). **RLS:** authenticated users can `SELECT` rows for their chapter (same pattern as chapter-scoped posts). Writes are intended for service-role sync jobs.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`, ON DELETE CASCADE)
- `crowded_account_id` (TEXT) — Crowded API account id (opaque string, often numeric); unique per chapter with `chapter_id`
- `display_name`, `status`, `currency` (TEXT, nullable) — optional cache from API
- `crowded_contact_id` (UUID, nullable)
- `balance_minor`, `hold_minor`, `available_minor` (BIGINT, nullable) — minor units (e.g. cents); **routing/account numbers are not stored**
- `last_synced_at` (TIMESTAMPTZ, nullable)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes:** `chapter_id`, `crowded_account_id`

### `crowded_transactions`
Transactions synced from Crowded, deduped by `crowded_transaction_id` per `(chapter_id, crowded_account_id)`. Composite FK to `crowded_accounts(chapter_id, crowded_account_id)`.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID) + `crowded_account_id` (TEXT) — composite FK to `crowded_accounts`
- `crowded_transaction_id` (TEXT) — Crowded’s stable id for upserts
- `amount_minor` (BIGINT, nullable), `currency`, `description`, `status` (TEXT, nullable)
- `occurred_at`, `posted_at`, `synced_at` (TIMESTAMPTZ)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes:** `chapter_id`, `crowded_account_id`, `synced_at`

### `posts`
Social feed posts.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `author_id` (UUID, Foreign Key → `profiles.id`)
- `content` (TEXT)
- `post_type` (TEXT) - "text", "image", "text_image"
- `image_url` (TEXT, nullable)
- `metadata` (JSONB) - Stores:
  - `link_previews` - Array of link preview objects
  - `image_urls` - Array of image URLs (for multiple images)
  - `image_count` - Number of images
- `likes_count` (INTEGER, default: 0)
- `comments_count` (INTEGER, default: 0)
- `shares_count` (INTEGER, default: 0)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `chapters` via `chapter_id`
- Belongs to `profiles` via `author_id`
- Has many `post_comments` via `post_id`
- Has many `post_likes` via `post_id`

**Common Queries:**
```typescript
// Get posts for a chapter with author info
const { data } = await supabase
  .from('posts')
  .select(`
    *,
    author:profiles!author_id(
      id,
      full_name,
      first_name,
      last_name,
      avatar_url,
      chapter_role,
      member_status
    )
  `)
  .eq('chapter_id', chapterId)
  .order('created_at', { ascending: false });

// Get single post with all relationships
const { data } = await supabase
  .from('posts')
  .select(`
    *,
    author:profiles!author_id(*),
    post_comments(count),
    post_likes(count)
  `)
  .eq('id', postId)
  .single();
```

### `post_comments`
Comments on posts.

**Key Columns:**
- `id` (UUID, Primary Key)
- `post_id` (UUID, Foreign Key → `posts.id`)
- `author_id` (UUID, Foreign Key → `profiles.id`)
- `content` (TEXT)
- `parent_comment_id` (UUID, nullable, Foreign Key → `post_comments.id`)
- `likes_count` (INTEGER, default: 0)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)
- `metadata` (JSONB, nullable) - Can store link previews

**Relationships:**
- Belongs to `posts` via `post_id`
- Belongs to `profiles` via `author_id`
- Self-referential: can have parent comment (for replies)
- Has many `comment_likes` via `comment_id`

**Common Queries:**
```typescript
// Get comments for a post (top-level only)
const { data } = await supabase
  .from('post_comments')
  .select(`
    *,
    author:profiles!author_id(
      id,
      full_name,
      first_name,
      last_name,
      avatar_url
    )
  `)
  .eq('post_id', postId)
  .is('parent_comment_id', null)
  .order('created_at', { ascending: true });

// Get replies to a comment
const { data } = await supabase
  .from('post_comments')
  .select(`
    *,
    author:profiles!author_id(*)
  `)
  .eq('parent_comment_id', commentId)
  .order('created_at', { ascending: true });
```

### `post_likes`
Likes on posts.

**Key Columns:**
- `id` (UUID, Primary Key)
- `post_id` (UUID, Foreign Key → `posts.id`)
- `user_id` (UUID, Foreign Key → `profiles.id`)
- `created_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `posts` via `post_id`
- Belongs to `profiles` via `user_id`

**Common Queries:**
```typescript
// Check if user liked a post
const { data } = await supabase
  .from('post_likes')
  .select('id')
  .eq('post_id', postId)
  .eq('user_id', userId)
  .single();

// Get like count for a post
const { count } = await supabase
  .from('post_likes')
  .select('*', { count: 'exact', head: true })
  .eq('post_id', postId);
```

### `comment_likes`
Likes on comments.

**Key Columns:**
- `id` (UUID, Primary Key)
- `comment_id` (UUID, Foreign Key → `post_comments.id`)
- `user_id` (UUID, Foreign Key → `profiles.id`)
- `created_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `post_comments` via `comment_id`
- Belongs to `profiles` via `user_id`

### `events`
Chapter events.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `created_by` (UUID, Foreign Key → `profiles.id`)
- `title` (TEXT)
- `description` (TEXT, nullable)
- `event_date` (TIMESTAMPTZ)
- `location` (TEXT, nullable)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `chapters` via `chapter_id`
- Belongs to `profiles` via `created_by`
- Has many `event_rsvps` via `event_id`

### `event_rsvps`
RSVPs for events.

**Key Columns:**
- `id` (UUID, Primary Key)
- `event_id` (UUID, Foreign Key → `events.id`)
- `user_id` (UUID, Foreign Key → `profiles.id`)
- `status` (TEXT) - "going", "not_going", "maybe"
- `created_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `events` via `event_id`
- Belongs to `profiles` via `user_id`

### `dues_cycles`
Chapter dues periods (semester, annual, etc.).

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `name`, `due_date`, `base_amount`, and other cycle fields (see app/API usage)
- `crowded_collection_id` (TEXT, nullable) — Crowded Collect **collection** id for member checkout (**TRA-415**); set when treasurer links the cycle to a Crowded collection

### `donation_campaigns`
Chapter-scoped donation drives / Crowded collections that are **not** tied to a dues cycle. **`POST` only creates `open` or `fundraiser`**; older rows may still have `kind = fixed`.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `title` (TEXT)
- `kind` (TEXT) — `fixed` | `open` | `fundraiser` (DB check); `fixed` (legacy) required positive `requested_amount_cents`; `open` and `fundraiser` require positive `goal_amount_cents`
- `crowded_collection_id` (TEXT, nullable) — Crowded collection id once created; unique when set
- `stripe_product_id` (TEXT, nullable) — Stripe Product id on the **connected** account for Stripe-backed campaigns (**TRA-683**)
- `stripe_price_id` (TEXT, nullable) — Stripe Price id for Checkout when campaign is Stripe-backed
- `goal_amount_cents` (BIGINT, nullable) — **minor units (cents)** sent to Crowded as `goalAmount`
- `requested_amount_cents` (BIGINT, nullable) — legacy `fixed` only; new creates set `null`
- `crowded_share_url` (TEXT, nullable) — share/checkout URL from Crowded `data.link` when returned
- `metadata` (JSONB) — e.g. `showOnPublicFundraisingChannels` for fundraiser drives
- `created_by` (UUID, Foreign Key → `profiles.id`)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**RLS:** Same pattern as `dues_cycles` — chapter members may **SELECT**; presidents, VPs, treasurers, secretaries, admins, and governance (via `governance_chapters`) may **INSERT/UPDATE/DELETE**.

**API:** `GET` / `POST` `/api/chapters/[id]/donations/campaigns` — `POST` accepts **`kind`: `open` | `fundraiser`** only, creates the Crowded collection, sets `requested_amount_cents` to `null`; `collect.payment.*` webhooks resolve `crowded_collection_id` against this table when no `dues_cycles` row matches.

### `donation_campaign_recipients`
Treasurer-linked chapter members for a donation drive. Crowded flows require a Crowded contact id at share time; Stripe-backed rows may leave `crowded_contact_id` null (**TRA-683**).

**Key Columns:**
- `id` (UUID, Primary Key)
- `donation_campaign_id` (UUID, Foreign Key → `donation_campaigns.id`, ON DELETE CASCADE)
- `profile_id` (UUID, Foreign Key → `profiles.id`, ON DELETE CASCADE)
- `crowded_contact_id` (TEXT, nullable) — Crowded Collect **contact** id at share time; null when recipient is Stripe-only
- `crowded_checkout_url` (TEXT, nullable) — per-recipient checkout from **POST …/collections/:id/intents** (`data.paymentUrl`) when campaign has no collection-level `crowded_share_url`
- `stripe_checkout_url` (TEXT, nullable) — Stripe Checkout Session URL for this recipient (**TRA-683**)
- `stripe_checkout_session_id` (TEXT, nullable) — Stripe `cs_…` id for idempotency and support
- `paid_at` (TIMESTAMPTZ, nullable) — when the recipient’s payment succeeded
- `amount_paid_cents` (BIGINT, nullable) — settled amount in minor units when paid
- `created_at` (TIMESTAMPTZ)
- **Unique:** `(donation_campaign_id, profile_id)`

**RLS:** Chapter members may **SELECT** rows for campaigns in their chapter; exec roles / admin / governance may **INSERT** and **DELETE** (same pattern as other chapter-scoped admin tables).

**API:** `GET` `/api/chapters/[id]/donations/campaigns/[campaignId]/recipients`, `GET` `…/share-candidates`, and `POST` `…/share` (see app routes).

### `stripe_webhook_events`
Idempotency ledger for Stripe webhook delivery (**TRA-683**). Insert a row (or rely on unique `stripe_event_id`) before applying donation/dues side effects so duplicate events are ignored. For **`checkout.session.completed`** with donation metadata (`purpose=trailblaize_chapter_donation`), **TRA-689** credits `donation_campaign_recipients.amount_paid_cents` / `paid_at` after a successful insert (Connect sessions must be delivered to the same webhook endpoint / signing secret you configure for the platform or Connect).

**Key Columns:**
- `id` (UUID, Primary Key)
- `stripe_event_id` (TEXT, NOT NULL, UNIQUE) — Stripe `evt_…` id
- `event_type` (TEXT, NOT NULL) — e.g. `checkout.session.completed`
- `received_at` (TIMESTAMPTZ)

**RLS:** Enabled with **no** policies for `anon` / `authenticated` — only the **service role** (Next.js webhook route) may read/write. Revoked from client roles in migration.

### `dues_assignments`
Dues/payment assignments.

**Key Columns:**
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key → `profiles.id`)
- `dues_cycle_id` (UUID, Foreign Key → `dues_cycles.id`) — primary chapter scoping is via the cycle’s `chapter_id`
- `amount_assessed`, `amount_due`, `amount_paid`, `status` (e.g. required, paid, waived), `notes`, `updated_at`

**Relationships:**
- Belongs to `profiles` via `user_id`
- Belongs to `dues_cycles` via `dues_cycle_id`

### `messages`
Direct messages between users.

**Key Columns:**
- `id` (UUID, Primary Key)
- `sender_id` (UUID, Foreign Key → `profiles.id`)
- `recipient_id` (UUID, Foreign Key → `profiles.id`)
- `content` (TEXT)
- `read_at` (TIMESTAMPTZ, nullable)
- `created_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `profiles` via `sender_id`
- Belongs to `profiles` via `recipient_id`

### `connections`
User connections (alumni networking).

**Key Columns:**
- `id` (UUID, Primary Key)
- `requester_id` (UUID, Foreign Key → `profiles.id`)
- `recipient_id` (UUID, Foreign Key → `profiles.id`)
- `status` (TEXT) - "pending", "accepted", "rejected"
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `profiles` via `requester_id`
- Belongs to `profiles` via `recipient_id`

### `announcements`
Chapter announcements.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `sender_id` (UUID, Foreign Key → `profiles.id`)
- `title` (TEXT)
- `content` (TEXT)
- `send_sms` (BOOLEAN, default: false)
- `created_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `chapters` via `chapter_id`
- Belongs to `profiles` via `sender_id`
- Has many `announcement_recipients` via `announcement_id`

### `announcement_recipients`
Recipients of announcements.

**Key Columns:**
- `id` (UUID, Primary Key)
- `announcement_id` (UUID, Foreign Key → `announcements.id`)
- `recipient_id` (UUID, Foreign Key → `profiles.id`)
- `read_at` (TIMESTAMPTZ, nullable)
- `created_at` (TIMESTAMPTZ)

### `tasks`
Chapter tasks/assignments.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `assignee_id` (UUID, Foreign Key → `profiles.id`)
- `assigned_by` (UUID, Foreign Key → `profiles.id`)
- `title` (TEXT)
- `description` (TEXT, nullable)
- `due_date` (DATE, nullable)
- `status` (TEXT) - "pending", "in_progress", "completed"
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `chapters` via `chapter_id`
- Belongs to `profiles` via `assignee_id`
- Belongs to `profiles` via `assigned_by`

### `invitations`
Chapter invitations.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `created_by` (UUID, Foreign Key → `profiles.id`)
- `token` (TEXT, unique)
- `email` (TEXT, nullable)
- `expires_at` (TIMESTAMPTZ)
- `used_at` (TIMESTAMPTZ, nullable)
- `created_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `chapters` via `chapter_id`
- Belongs to `profiles` via `created_by`
- Has many `invitation_usage` via `invitation_id`

### `invitation_usage`
Tracks invitation usage.

**Key Columns:**
- `id` (UUID, Primary Key)
- `invitation_id` (UUID, Foreign Key → `invitations.id`)
- `user_id` (UUID, Foreign Key → `profiles.id`)
- `used_at` (TIMESTAMPTZ)

### `recruits`
Recruitment submissions.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `submitted_by` (UUID, Foreign Key → `profiles.id`)
- `name` (TEXT)
- `email` (TEXT)
- `phone` (TEXT, nullable)
- `notes` (TEXT, nullable)
- `status` (TEXT) - "pending", "contacted", "accepted", "rejected"
- `created_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `chapters` via `chapter_id`
- Belongs to `profiles` via `submitted_by`

### `documents`
Chapter documents.

**Key Columns:**
- `id` (UUID, Primary Key)
- `chapter_id` (UUID, Foreign Key → `chapters.id`)
- `uploaded_by` (UUID, Foreign Key → `profiles.id`)
- `title` (TEXT)
- `file_url` (TEXT)
- `file_type` (TEXT)
- `file_size` (INTEGER)
- `created_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `chapters` via `chapter_id`
- Belongs to `profiles` via `uploaded_by`

### `notifications_settings`
User notification preferences.

**Key Columns:**
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key → `profiles.id`)
- `email_enabled` (BOOLEAN, default: true)
- `sms_enabled` (BOOLEAN, default: false)
- `push_enabled` (BOOLEAN, default: true)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Relationships:**
- Belongs to `profiles` via `user_id`

## Key Relationships Summary

```
chapters
  ├── has_many profiles (via chapter_id)
  ├── has_many posts (via chapter_id)
  ├── has_many events (via chapter_id)
  └── has_many announcements (via chapter_id)

profiles
  ├── belongs_to chapters (via chapter_id)
  ├── has_many posts (via author_id)
  ├── has_many post_comments (via author_id)
  ├── has_many post_likes (via user_id)
  ├── has_many comment_likes (via user_id)
  ├── has_many messages (via sender_id/recipient_id)
  ├── has_many connections (via requester_id/recipient_id)
  └── has_many events (via created_by)

posts
  ├── belongs_to chapters (via chapter_id)
  ├── belongs_to profiles (via author_id)
  ├── has_many post_comments (via post_id)
  └── has_many post_likes (via post_id)

post_comments
  ├── belongs_to posts (via post_id)
  ├── belongs_to profiles (via author_id)
  ├── belongs_to post_comments (via parent_comment_id) - self-referential
  └── has_many comment_likes (via comment_id)
```

## Row Level Security (RLS)

All tables should have RLS policies enabled. Common patterns:

### Chapter-Scoped Access
- Users can only see data from their own chapter
- Example: Posts are only visible to members of the same chapter

### User-Specific Access
- Users can only modify their own data
- Example: Users can only edit their own profile

### Role-Based Access
- Exec/admin roles have elevated permissions
- Example: Only exec members can create announcements

## Common Query Patterns

### Fetching with Relationships
```typescript
// Always use Supabase's select syntax for relationships
const { data } = await supabase
  .from('posts')
  .select(`
    *,
    author:profiles!author_id(*),
    post_comments(count)
  `);
```

### Filtering by Chapter
```typescript
// Always filter by chapter_id for chapter-scoped data
const { data } = await supabase
  .from('posts')
  .select('*')
  .eq('chapter_id', chapterId);
```

### Counting Related Records
```typescript
// Use count for aggregations
const { count } = await supabase
  .from('post_likes')
  .select('*', { count: 'exact', head: true })
  .eq('post_id', postId);
```

### Pagination
```typescript
// Use range for pagination
const { data } = await supabase
  .from('posts')
  .select('*')
  .range(page * limit, (page + 1) * limit - 1)
  .order('created_at', { ascending: false });
```

## Metadata JSONB Fields

Several tables use JSONB `metadata` fields:

### `posts.metadata`
```typescript
{
  link_previews?: LinkPreview[];
  image_urls?: string[];
  image_count?: number;
  profile_update?: {
    source: 'profile_update_prompt';
    changed_fields: string[];
    change_types: string[];
  };
}
```

### `post_comments.metadata` (Future)
```typescript
{
  link_previews?: LinkPreview[];
}
```

## Migration Guidelines

1. Always create migrations in `supabase/migrations/`
2. Use descriptive filenames: `YYYYMMDD_description.sql`
3. Test migrations in development first
4. Backup production before running migrations
5. Use `IF NOT EXISTS` for safety
6. Add indexes for frequently queried columns
7. Add comments for documentation

## Notes

- All tables use UUIDs for primary keys
- Timestamps use `TIMESTAMPTZ` (timezone-aware)
- Foreign keys use `UUID` type
- Use `snake_case` for column names (Supabase convention)
- Always include `created_at` and `updated_at` timestamps
- Use `nullable` fields appropriately (avoid null when possible)
