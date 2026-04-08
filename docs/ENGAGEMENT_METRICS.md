# Member Engagement Metrics — TRA-520

> Defines what "engaged" means for a member, establishes baseline measurement queries, and sets target deltas for the **Member Engagement: Feed & Discovery** project.

---

## 1. Key Engagement Metrics

All metrics are computed over a **rolling 30-day window** (configurable up to 90 days) and scoped per chapter.

| # | Metric | Formula | Data source |
|---|--------|---------|-------------|
| 1 | **DAU/WAU ratio** (stickiness) | `count(profiles.last_active_at ≥ now − 1d) / count(profiles.last_active_at ≥ now − 7d)` | `profiles.last_active_at` |
| 2 | **Post creation rate** | `count(posts in window) / active_members` | `posts.created_at`, `posts.chapter_id` |
| 3 | **Comment rate** | `count(post_comments in window) / active_members` | `post_comments.created_at` joined through `posts.chapter_id` |
| 4 | **Event attendance rate** | `count(event_rsvps where status = 'attending'/'going' in window) / active_members` | `event_rsvps.created_at`, `event_rsvps.status` |
| 5 | **Connection rate** | `count(connections where status = 'accepted' in window) / active_members` | `connections.created_at`, `connections.status` |
| 6 | **Member engagement score** | Weighted composite (see §2) | All of the above |

**active_members** = profiles with `last_active_at` within the rolling window.

---

## 2. Member Engagement Score

A per-member composite score that weights each activity type by effort and value to the community.

### Weights

| Activity | Points | Rationale |
|----------|--------|-----------|
| Post created | **3** | High effort, generates content for others |
| Comment created | **2** | Drives conversation |
| Post liked | **1** | Low effort but signals engagement |
| Event RSVP (attending) | **4** | Strongest offline engagement signal |
| Connection made (accepted) | **2** | Grows the network |
| Active day | **1** | Baseline presence (1 point if active in window) |

### Formula

```
score = (posts × 3) + (comments × 2) + (post_likes × 1)
      + (event_rsvps × 4) + (connections × 2) + (active_days × 1)
```

### Tiers

| Tier | Score range | Description |
|------|-------------|-------------|
| Inactive | 0 | No activity in the window |
| Low | 1–5 | Minimal engagement (logged in, maybe liked a post) |
| Moderate | 6–15 | Regular consumer (a few likes/comments per month) |
| Active | 16–30 | Contributor (posts, comments, attends events) |
| Highly Active | 31+ | Power user (frequent posts, event attendance, connections) |

---

## 3. Baseline & Targets

The table below captures baselines (to be populated from Supabase queries) and target deltas for the Feed & Discovery project.

| Metric | Current baseline | Target delta | Timeframe |
|--------|-----------------|--------------|-----------|
| DAU/WAU ratio | _TBD — pull from API_ | **+15%** (e.g. 0.20 → 0.23) | 30 days post-launch |
| Post creation rate | _TBD_ | **+25%** increase per active member | 30 days post-launch |
| Comment rate | _TBD_ | **+30%** increase per active member | 30 days post-launch |
| Event attendance rate | _TBD_ | **+10%** increase per active member | 60 days post-launch |
| Connection rate | _TBD_ | **+40%** increase per active member | 30 days post-launch |
| Avg engagement score | _TBD_ | **+20%** chapter-wide average | 30 days post-launch |
| % members in "Active" or higher tier | _TBD_ | **+15 pp** (percentage points) | 60 days post-launch |

> **How to populate baselines:** Call `GET /api/engagement-metrics?chapterId=<id>` for each target chapter, or run the service function directly. The API returns all six metrics plus member score distribution.

---

## 4. API Reference

### `GET /api/engagement-metrics`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `chapterId` | `uuid` | Caller's chapter | Chapter to query |
| `windowDays` | `number` | `30` | Rolling window (1–90) |
| `topN` | `number` | `10` | Top N members by score |

**Response** (`EngagementMetricsResponse`):

```json
{
  "metrics": {
    "chapterId": "uuid",
    "chapterName": "Alpha Beta",
    "windowDays": 30,
    "totalMembers": 85,
    "activeMembers": 42,
    "dauWauRatio": 0.35,
    "postCreationRate": 1.2,
    "commentRate": 2.8,
    "eventAttendanceRate": 0.6,
    "connectionRate": 0.4,
    "avgEngagementScore": 8.3,
    "scoreTierDistribution": {
      "inactive": 20,
      "low": 15,
      "moderate": 28,
      "active": 16,
      "highlyActive": 6
    }
  },
  "topMembers": [
    {
      "userId": "uuid",
      "fullName": "Jane Doe",
      "avatarUrl": "https://...",
      "score": 47,
      "tier": "highly_active",
      "breakdown": {
        "posts": 5,
        "comments": 8,
        "postLikes": 12,
        "eventRsvps": 2,
        "connections": 3,
        "activeDays": 1
      }
    }
  ],
  "computedAt": "2026-04-01T12:00:00.000Z"
}
```

**Access control:** Chapter exec admins (president, VP, treasurer, secretary), developers, governance users with the chapter in their managed set.

### React hook

```typescript
import { useEngagementMetrics } from '@/lib/hooks/useEngagementMetrics';

const { data, isLoading, error } = useEngagementMetrics({
  chapterId: 'optional-uuid',
  windowDays: 30,
  topN: 10,
});
```

---

## 5. Implementation Files

| File | Purpose |
|------|---------|
| `types/engagement.ts` | TypeScript types, score weights, tier thresholds |
| `lib/services/engagementMetricsService.ts` | Core computation (queries Supabase, computes scores) |
| `app/api/engagement-metrics/route.ts` | API route with auth + authorisation |
| `lib/hooks/useEngagementMetrics.ts` | React Query hook for client consumption |
| `docs/ENGAGEMENT_METRICS.md` | This document |

---

## 6. Future Work

- **Populate baselines** once connected to production Supabase (fill in _TBD_ rows in §3).
- **Dashboard UI** — add an engagement metrics card to the executive dashboard (`UnifiedExecutiveDashboard`).
- **Historical tracking** — persist daily snapshots to a `chapter_engagement_snapshots` table for trend analysis.
- **Refined active-day counting** — once we track individual activity events (not just `last_active_at`), compute distinct active days per member.
- **Agree on final target deltas** with the product team and update §3.
