/**
 * Engagement metrics types for TRA-520.
 *
 * Metrics are computed per-chapter over a configurable rolling window
 * (default 30 days) and consumed by governance dashboards and the
 * chapter executive overview.
 */

// ---------------------------------------------------------------------------
// Per-chapter aggregate metrics
// ---------------------------------------------------------------------------

export interface ChapterEngagementMetrics {
  chapterId: string;
  chapterName: string;

  /** Rolling window in days the metrics were computed over. */
  windowDays: number;

  /** Total registered members (active + alumni) in the chapter. */
  totalMembers: number;

  /** Members with `last_active_at` in the rolling window. */
  activeMembers: number;

  /** DAU/WAU stickiness ratio (0–1). Higher = more daily re-engagement. */
  dauWauRatio: number;

  /** Posts created per active member in the window. */
  postCreationRate: number;

  /** Comments created per active member in the window. */
  commentRate: number;

  /** Event RSVPs (attending) per active member in the window. */
  eventAttendanceRate: number;

  /** Accepted connections per active member in the window. */
  connectionRate: number;

  /** Average member engagement score across all chapter members. */
  avgEngagementScore: number;

  /** Distribution of members across engagement tiers. */
  scoreTierDistribution: ScoreTierDistribution;
}

// ---------------------------------------------------------------------------
// Per-member engagement score
// ---------------------------------------------------------------------------

export interface MemberEngagementScore {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;

  /** Raw composite score (unbounded, ≥ 0). */
  score: number;

  /** Human-readable tier label derived from the score. */
  tier: EngagementTier;

  /** Breakdown of points by activity type. */
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  posts: number;
  comments: number;
  postLikes: number;
  eventRsvps: number;
  connections: number;
  activeDays: number;
}

export type EngagementTier =
  | 'inactive'
  | 'low'
  | 'moderate'
  | 'active'
  | 'highly_active';

export interface ScoreTierDistribution {
  inactive: number;
  low: number;
  moderate: number;
  active: number;
  highlyActive: number;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface EngagementMetricsResponse {
  metrics: ChapterEngagementMetrics;
  topMembers: MemberEngagementScore[];
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Score weights — centralised so service + docs stay in sync
// ---------------------------------------------------------------------------

export const ENGAGEMENT_SCORE_WEIGHTS = {
  POST_CREATED: 3,
  COMMENT_CREATED: 2,
  POST_LIKED: 1,
  EVENT_RSVP: 4,
  CONNECTION_MADE: 2,
  ACTIVE_DAY: 1,
} as const;

export const ENGAGEMENT_TIER_THRESHOLDS = {
  inactive: 0,
  low: 1,
  moderate: 6,
  active: 16,
  highlyActive: 31,
} as const;
