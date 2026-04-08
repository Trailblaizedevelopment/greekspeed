# TRA-521: Feed & Connections UX Audit

**Date:** 2026-03-26
**Author:** Engineering (automated audit)
**Status:** Complete — ready for team review

---

## Table of Contents

1. [Current Feed Flow Map](#1-current-feed-flow-map)
2. [Current Connections Flow Map](#2-current-connections-flow-map)
3. [Feed Friction Points & Drop-off Analysis](#3-feed-friction-points--drop-off-analysis)
4. [Top 5 Feed Improvements (Highest Engagement Potential)](#4-top-5-feed-improvements)
5. [Top 5 Discovery/Connection Improvements](#5-top-5-discoveryconnection-improvements)
6. [Prioritized Feature List for Milestones 2 & 3](#6-prioritized-feature-list-for-milestones-2--3)

---

## 1. Current Feed Flow Map

### Post Creation

| Layer | File | Description |
|-------|------|-------------|
| UI | `components/features/social/CreatePostModal.tsx` | Text + up to 10 images; validates content; builds `CreatePostRequest` |
| Image upload | `lib/services/postImageService.ts` | Client-side upload to Supabase Storage bucket `post-images` |
| Feed wiring | `components/features/dashboard/dashboards/ui/SocialFeed.tsx` | `handleCreatePost` → `createPost` from `usePosts` hook |
| Hook | `lib/hooks/usePosts.ts` | `POST /api/posts`; optimistic cache prepend to page 1 of infinite query |
| API | `app/api/posts/route.ts` | Auth, role check, link preview enrichment, DB insert |

**Entry points:**
- Desktop: "Start a post" card (hidden on mobile via `hidden sm:block`)
- Mobile: Floating action button (FAB) at bottom-right (`sm:hidden`)

### Post Rendering (Feed)

| Layer | File | Description |
|-------|------|-------------|
| Server | `app/dashboard/page.tsx` | SSR: parallel fetch of first page posts + likes + count; slimmed via `toSlimPostShape` |
| Client hydration | `app/dashboard/DashboardPageClient.tsx` | Passes `initialFeed` to role-specific dashboard overview |
| Role views | `ActiveMemberOverview.tsx`, `AdminOverview.tsx`, `AlumniOverview.tsx` | Each embeds `SocialFeed` with `chapterId` and `initialFeed` |
| Feed component | `SocialFeed.tsx` | Merges SSR data with React Query infinite query; `@tanstack/react-virtual` window virtualizer; "All \| Connections" client filter; new-posts pill (60s polling) |
| Post card | `components/features/social/PostCard.tsx` | Renders content, images (lazy via `PostImageGrid`), link previews, actions; supports `feed` \| `profile` variants |
| Feed cache | `lib/cache/feedCache.ts` | localStorage fallback (5-min TTL) when SSR data unavailable |

**Pagination:** Infinite scroll with intersection observer (`loadMoreRef`); gated by `hasScrolled` to prevent premature page-2 fetch.

**Sorting:** `created_at DESC` (chronological, newest first). No algorithmic ranking.

### Like Interactions

| Step | File | Details |
|------|------|---------|
| UI trigger | `PostCard.tsx` | Click (desktop) or double-tap (mobile, 400ms threshold) |
| Optimistic update | `usePosts.ts` | Updates `is_liked` + `likes_count` in infinite query cache; rollback on failure |
| API | `app/api/posts/[id]/like/route.ts` | Toggle insert/delete on `post_likes`; manual `likes_count` increment (not atomic) |
| Notifications | Same API route | Push (OneSignal), email (SendGrid), SMS on like (not unlike) |

### Comment Interactions

| Step | File | Details |
|------|------|---------|
| Inline preview | `PostCard.tsx` | Shows `comments_preview` (up to 4); inline composer appears on click |
| Full thread | `CommentModal.tsx` | Embedded on `/dashboard/post/[id]` or as dialog; threaded UI |
| Hook | `lib/hooks/useComments.ts` | Fetch page 1 only; `buildCommentTree` (max 1-level nesting); Supabase Realtime for INSERT/DELETE/UPDATE |
| API | `app/api/posts/[id]/comments/route.ts` | GET (paginated), POST (with link previews + notifications) |
| Comment likes | `app/api/posts/[id]/comments/[commentId]/like/route.ts` | Toggle with optimistic UI + rollback |

### Real-time Features

| Feature | Mechanism | Notes |
|---------|-----------|-------|
| Comment list | Supabase `postgres_changes` on `post_comments` | Per-post channel when comments are open |
| Comment count badge | Supabase `postgres_changes` INSERT/DELETE | Lightweight per-post subscription |
| New posts in feed | **Polling** page 1 every 60 seconds | "N new posts" pill → invalidate query on tap |
| Post list | **No Realtime** | Only polling |

---

## 2. Current Connections Flow Map

### Can members connect?

**Yes.** The connection lifecycle is fully implemented:

```
[Not Connected] → Send Request (with optional message)
    → [Pending] → Accept → [Connected] → Can Message
                → Decline → [Declined]
                → Cancel (by requester)
    → [Connected] → Block
```

### Architecture

| Layer | File | Description |
|-------|------|-------------|
| State management | `lib/contexts/ConnectionsContext.tsx` | Global context: fetch, send, update, cancel, `getConnectionStatus`, deferred load (~5s) |
| API: list/create | `app/api/connections/route.ts` | GET connections with profile joins; POST new request with notifications |
| API: update/delete | `app/api/connections/[id]/route.ts` | PATCH status (accept/decline/block); DELETE (cancel) |
| API: mutual | `app/api/connections/mutual/route.ts` | Mutual connections between two users |
| Request dialog | `components/features/connections/ConnectionRequestDialog.tsx` | Bottom drawer with optional 200-char message |
| Management UI | `components/ui/ConnectionManagement.tsx` | Tabs: pending inbox, sent, declined |

### Where Connection Actions Appear

| Surface | Component | Actions |
|---------|-----------|---------|
| Chapter member cards | `LinkedInStyleChapterCard.tsx` | Connect / Requested / Accept+Decline / Connected→Messages |
| Networking spotlight (desktop sidebar) | `NetworkingSpotlightCard.tsx` | Up to 10 weighted-shuffle suggestions; Connect button |
| Mobile network page | `MobileNetworkPage.tsx` | Grow/Catch-up tabs; suggestions, recently connected, reconnect |
| Alumni cards | `EnhancedAlumniCard.tsx` | Connect + mutual connection counts |
| Public profile | `PublicProfileClient.tsx` | Connect / Accept / Decline / Cancel / Message + "People you may know" |
| User profile modal | `UserProfileModal.tsx` / `UserProfileView.tsx` | Connection CTAs |
| Feed filter | `SocialFeed.tsx` | "Connections" tab filters to accepted connections' posts |

### Notifications on Connection Events

- **New request:** Push (OneSignal) + email (SendGrid) + SMS (Twilio/Telnyx)
- **Request accepted:** Push + email + SMS
- **Dashboard badge:** Pending count in `DashboardHeader`

---

## 3. Feed Friction Points & Drop-off Analysis

> **Note:** No client-side analytics (Mixpanel, Amplitude, PostHog) are instrumented in the feed. The analysis below is based on code-level UX review.

### Critical Friction Points

#### F1: Post creation failure is silent
**Location:** `SocialFeed.tsx` → `handleCreatePost`
**Issue:** When `createPost` throws, the error is caught and logged to `console.error` but **no toast or error message** is shown. The user sees the modal close with no feedback and their post vanishes.
**Impact:** Members who experience a transient failure may believe the app is broken and stop posting.

#### F2: No "load more comments" — only page 1 is ever fetched
**Location:** `useComments.ts` → `fetchComments` always called with `page = 1`
**Issue:** The API supports pagination (`page` + `limit` params), but the hook never requests page 2+. Posts with 50+ comments only show the first 20 (or 4 in feed preview). There is no "View older comments" button.
**Impact:** Engaged threads appear truncated. Members can't see the full conversation, reducing reply rates.

#### F3: "Connections" feed filter is purely client-side
**Location:** `SocialFeed.tsx` → filters `mergedPosts` by `author_id` in accepted connections
**Issue:** The full chapter feed is always fetched; filtering happens in the browser. This means:
- Large chapters still load all posts even when the user only wants connections' content
- Pagination counts don't reflect the filter (you may have "0 posts" after filtering a page that had 20)
**Impact:** The "Connections" tab may appear empty or sparse, discouraging its use.

#### F4: No content ranking — purely reverse-chronological
**Location:** `app/api/posts/route.ts` → `order('created_at', { ascending: false })`
**Issue:** All posts are equal. High-engagement posts sink below newer low-engagement ones. No "hot" or "trending" view.
**Impact:** Members scrolling through must find good content manually; low signal-to-noise ratio as chapter grows.

#### F5: Mobile double-tap like has a 350ms navigation delay
**Location:** `PostCard.tsx` → `handleMobileCardTap`
**Issue:** Single tap waits 350ms (to disambiguate from double-tap) before navigating to post detail. This creates perceptible lag on every mobile tap.
**Impact:** The feed feels sluggish on mobile — the primary device for college students.

### Moderate Friction Points

#### F6: No skeleton/shimmer for post cards
When React Query is loading and no SSR/cache data is available, users see a spinner ("Loading feed…") rather than content-shaped placeholders.

#### F7: Like count updates are not atomic
`app/api/posts/[id]/like/route.ts` does a read-modify-write on `posts.likes_count`. Under concurrent likes, counts can drift.

#### F8: Verbose client-side logging
`usePosts.ts` and `SocialFeed.tsx` contain production `console.log` calls that may leak user data in dev tools and add noise.

#### F9: Post metadata uses `Record<string, any>`
`types/posts.ts` → `metadata` field is loosely typed. This makes it harder to safely access image URLs, link previews, or future metadata without runtime checks.

#### F10: Comment composer on desktop only opens after click
The inline comment composer in `PostCard` is hidden until the user clicks the comment icon, which toggles `showCommentComposer`. This extra click adds friction to commenting.

---

## 4. Top 5 Feed Improvements

Ranked by estimated engagement lift.

### 1. Reactions Beyond "Like" (emoji reactions)
**Why:** A single like is low-signal. Emoji reactions (👍 ❤️ 😂 🔥 👏) let members express sentiment without writing a comment. Every major social platform has adopted this.
**Expected lift:** 2-3x interaction rate on posts based on industry benchmarks.
**Complexity:** Medium — new `post_reactions` table, UI overlay, API route.

### 2. Rich Comment UX — Infinite Scroll + "Load More" + Typing Indicators
**Why:** Comments drive the most engagement loops (post → comment → reply → notification → return). Currently truncated at page 1 with no way to load more.
**Expected lift:** Significant increase in comment thread depth and reply rates.
**Complexity:** Low-medium — `useComments` already supports pagination server-side; need UI + hook changes.

### 3. Smart Feed Ranking (Hot/Trending + Chronological Toggle)
**Why:** As chapters grow past ~30 members, chronological feeds become noisy. A "hot" algorithm (recency × engagement) surfaces quality content.
**Expected lift:** Longer session times, higher like/comment rates per session.
**Complexity:** Medium — scoring function in API, new sort param, toggle UI.

### 4. Post Creation Error Handling + Drafts
**Why:** Silent creation failures cause drop-off. Auto-saving drafts prevents content loss.
**Expected lift:** Higher post completion rate, especially on mobile.
**Complexity:** Low (error toasts) to medium (draft persistence).

### 5. Real-time Feed Updates (Replace Polling)
**Why:** 60-second polling means new posts appear delayed. Supabase Realtime on `posts` would show new content instantly with a smooth animation.
**Expected lift:** Increased session frequency (members check more often when content feels "live").
**Complexity:** Low-medium — Realtime is already used for comments; extend pattern to posts.

---

## 5. Top 5 Discovery/Connection Improvements

Ranked by member benefit potential.

### 1. Dedicated "My Network" Tab in Primary Navigation
**Why:** Connection management is buried under notifications and messaging. Members can't easily see who they're connected to, who's pending, or discover new people. LinkedIn's #2 nav item is "My Network" for a reason.
**Expected lift:** Increased connection request volume, higher acceptance rates.
**Complexity:** Low — `ConnectionManagement` and `MobileNetworkPage` components exist; need a first-class route and nav entry.

### 2. Structured Member Filters (Graduation Year, Major, Interests, Role)
**Why:** "My Chapter" search only supports name/major/bio substring matching. No filter dropdowns. Members can't find "all 2024 grads in finance."
**Expected lift:** More targeted connections = higher acceptance + message rates.
**Complexity:** Medium — API needs filter params; `MyChapterContent` needs filter UI; profile data may need `interests` field population.

### 3. "People You May Know" Feed Widget
**Why:** `NetworkingSpotlightCard` exists on desktop sidebar but is absent from the main feed. A LinkedIn-style inline card in the feed ("Connect with 3 members") would passively drive discovery.
**Expected lift:** Connection requests from passive browsing (highest volume driver on LinkedIn).
**Complexity:** Low — reuse `NetworkingSpotlightCard` logic; inject as a virtual row in the feed at position N.

### 4. Connection Strength Signals (Mutual Connections, Shared Interests)
**Why:** Mutual connection counts already appear on alumni cards but not consistently on chapter member cards. Adding "3 mutual connections" + "Both interested in Finance" would increase request quality.
**Expected lift:** Higher acceptance rates; more meaningful connections.
**Complexity:** Medium — need profile `interests` data; extend `ChapterMember` API response.

### 5. Enable "Actively Hiring" Alumni Tab
**Why:** `ActivelyHiringPage.tsx` and the full UI exist but the tab is disabled (`disabled: true`) in `AlumniDashboard.tsx`. This is the highest-value alumni feature for undergrad members.
**Expected lift:** Major engagement driver for alumni↔active member connections.
**Complexity:** Very low — remove the `disabled` flag; ensure data is being populated.

---

## 6. Prioritized Feature List for Milestones 2 & 3

### Milestone 2: Feed Engagement (Ship First)

Focus: Make the existing feed more interactive and reliable.

| Priority | Feature | Issue Ref | Effort | Impact |
|----------|---------|-----------|--------|--------|
| P0 | Post creation error toasts + retry | — | XS | Prevents user frustration / silent failures |
| P0 | Comment pagination ("Load more" / infinite scroll) | — | S | Unlocks engagement in active threads |
| P1 | Emoji reactions on posts | — | M | 2-3x interaction rate uplift |
| P1 | Smart feed ranking toggle (Hot/Recent) | — | M | Longer sessions, better content discovery |
| P2 | Realtime feed updates (replace 60s polling) | — | S | Feed feels "live," drives return visits |
| P2 | Mobile tap latency fix (remove 350ms delay) | — | XS | Snappier feel on primary device |
| P3 | Post skeletons/shimmer loading states | — | XS | Perceived performance improvement |
| P3 | Atomic like counts (DB function) | — | XS | Data integrity under concurrency |

### Milestone 3: Discovery & Connections

Focus: Make it easy to find and connect with the right people.

| Priority | Feature | Issue Ref | Effort | Impact |
|----------|---------|-----------|--------|--------|
| P0 | First-class "My Network" page + nav entry | — | S | Surfaces connection management prominently |
| P0 | Structured member filters (year, major, interests) | — | M | Targeted discovery = higher quality connections |
| P1 | "People You May Know" inline feed widget | — | S | Passive discovery while browsing feed |
| P1 | Enable "Actively Hiring" alumni tab | — | XS | Highest-value alumni feature already built |
| P2 | Connection strength signals on member cards | — | M | Higher acceptance rates |
| P2 | Server-side "connections" feed filter | — | S | Fix empty-state issues, reduce payload |
| P3 | Cross-chapter discovery (multi-chapter orgs) | — | L | Future scope for national organizations |

### Effort Key

| Label | Description |
|-------|-------------|
| XS | < 1 file change, minimal logic |
| S | 2-4 files, straightforward pattern |
| M | 5-10 files, new DB table or API route |
| L | 10+ files, architectural changes |

---

## Appendix: File Reference

### Feed Components
- `components/features/social/PostCard.tsx` — Main post card (1267 lines)
- `components/features/social/CreatePostModal.tsx` — Post creation dialog
- `components/features/social/CommentModal.tsx` — Full comment thread UI
- `components/features/social/PostActionsMenu.tsx` — Edit/delete/report/bookmark menu
- `components/features/social/PostImageGrid.tsx` — Responsive image grid
- `components/features/social/LinkPreviewCard.tsx` — OG link preview
- `components/features/social/DeletePostModal.tsx` — Delete confirmation
- `components/features/social/ReportPostModal.tsx` — Report post

### Feed Infrastructure
- `components/features/dashboard/dashboards/ui/SocialFeed.tsx` — Feed container + virtualizer
- `lib/hooks/usePosts.ts` — Infinite query + mutations
- `lib/hooks/useComments.ts` — Comments + Realtime + tree building
- `lib/hooks/useCommentCount.ts` — Realtime comment count
- `lib/cache/feedCache.ts` — localStorage feed cache
- `app/api/posts/route.ts` — Feed list + create
- `app/api/posts/[id]/route.ts` — Single post CRUD
- `app/api/posts/[id]/like/route.ts` — Like toggle
- `app/api/posts/[id]/comments/route.ts` — Comments list + create
- `app/api/posts/[id]/comments/[commentId]/like/route.ts` — Comment like toggle

### Connection Components
- `components/features/connections/ConnectionRequestDialog.tsx` — Send request drawer
- `components/ui/ConnectionManagement.tsx` — Pending/sent/declined tabs
- `lib/contexts/ConnectionsContext.tsx` — Global connection state
- `app/api/connections/route.ts` — Connections list + create
- `app/api/connections/[id]/route.ts` — Accept/decline/block/cancel

### Discovery Components
- `components/features/dashboard/dashboards/ui/NetworkingSpotlightCard.tsx` — Desktop sidebar suggestions
- `components/features/dashboard/dashboards/ui/MobileNetworkPage.tsx` — Mobile networking UI
- `components/mychapter/MyChapterPage.tsx` — Chapter member directory
- `components/features/alumni/AlumniDashboard.tsx` — Alumni hub with pipeline + chapter tabs
- `components/features/alumni/AlumniFilterBar.tsx` — Multi-filter alumni search
- `app/dashboard/network/manage/page.tsx` — Connection management route

### Profile / Viewing
- `app/profile/[slug]/PublicProfileClient.tsx` — Public profile with posts, mutual connections, "People you may know"
- `components/features/user-profile/UserProfileModal.tsx` — Desktop profile modal
- `lib/contexts/ProfileModalContext.tsx` — Profile modal state management
