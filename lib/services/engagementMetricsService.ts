import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChapterEngagementMetrics,
  MemberEngagementScore,
  ScoreBreakdown,
  EngagementTier,
  ScoreTierDistribution,
} from '@/types/engagement';
import {
  ENGAGEMENT_SCORE_WEIGHTS as W,
  ENGAGEMENT_TIER_THRESHOLDS,
} from '@/types/engagement';

const DEFAULT_WINDOW_DAYS = 30;

function tierFromScore(score: number): EngagementTier {
  if (score >= ENGAGEMENT_TIER_THRESHOLDS.highlyActive) return 'highly_active';
  if (score >= ENGAGEMENT_TIER_THRESHOLDS.active) return 'active';
  if (score >= ENGAGEMENT_TIER_THRESHOLDS.moderate) return 'moderate';
  if (score >= ENGAGEMENT_TIER_THRESHOLDS.low) return 'low';
  return 'inactive';
}

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Compute chapter-level engagement metrics and per-member scores.
 *
 * All queries use the service-role client so RLS is bypassed — the caller
 * is responsible for authorisation checks.
 */
export async function getChapterEngagementMetrics(
  supabase: SupabaseClient,
  chapterId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
  topN: number = 10
): Promise<{
  metrics: ChapterEngagementMetrics;
  topMembers: MemberEngagementScore[];
}> {
  const cutoff = isoNDaysAgo(windowDays);
  const cutoff24h = isoNDaysAgo(1);
  const cutoff7d = isoNDaysAgo(7);

  // ------------------------------------------------------------------
  // 1. Chapter info
  // ------------------------------------------------------------------
  const { data: chapter } = await supabase
    .from('chapters')
    .select('id, name')
    .eq('id', chapterId)
    .single();

  const chapterName = chapter?.name ?? '';

  // ------------------------------------------------------------------
  // 2. All profiles in the chapter (for denominators + score computation)
  // ------------------------------------------------------------------
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, last_active_at')
    .eq('chapter_id', chapterId);

  const members = profiles ?? [];
  const totalMembers = members.length;

  const activeMembersInWindow = members.filter(
    (m) => m.last_active_at && m.last_active_at >= cutoff
  ).length;

  // DAU / WAU
  const dau = members.filter(
    (m) => m.last_active_at && m.last_active_at >= cutoff24h
  ).length;
  const wau = members.filter(
    (m) => m.last_active_at && m.last_active_at >= cutoff7d
  ).length;
  const dauWauRatio = wau > 0 ? round(dau / wau, 2) : 0;

  // ------------------------------------------------------------------
  // 3. Aggregate activity counts in the window (parallelised)
  // ------------------------------------------------------------------
  const memberIds = members.map((m) => m.id);

  const [postsRes, commentsRes, likesRes, rsvpsRes, connectionsRes] =
    await Promise.all([
      supabase
        .from('posts')
        .select('id, author_id, created_at')
        .eq('chapter_id', chapterId)
        .gte('created_at', cutoff),

      supabase
        .from('post_comments')
        .select('id, author_id, created_at, post_id')
        .in(
          'post_id',
          // sub-select: comment's post must belong to this chapter
          (
            await supabase
              .from('posts')
              .select('id')
              .eq('chapter_id', chapterId)
          ).data?.map((p) => p.id) ?? []
        )
        .gte('created_at', cutoff),

      supabase
        .from('post_likes')
        .select('id, user_id, created_at')
        .in('user_id', memberIds)
        .gte('created_at', cutoff),

      supabase
        .from('event_rsvps')
        .select('id, user_id, created_at, status')
        .in('user_id', memberIds)
        .gte('created_at', cutoff),

      supabase
        .from('connections')
        .select('id, requester_id, recipient_id, created_at, status')
        .or(
          `requester_id.in.(${memberIds.join(',')}),recipient_id.in.(${memberIds.join(',')})`
        )
        .eq('status', 'accepted')
        .gte('created_at', cutoff),
    ]);

  const posts = postsRes.data ?? [];
  const comments = commentsRes.data ?? [];
  const likes = likesRes.data ?? [];
  const rsvps = (rsvpsRes.data ?? []).filter(
    (r) => r.status === 'attending' || r.status === 'going'
  );
  const connections = connectionsRes.data ?? [];

  // ------------------------------------------------------------------
  // 4. Chapter-level rates (per active member)
  // ------------------------------------------------------------------
  const denom = activeMembersInWindow || 1;
  const postCreationRate = round(posts.length / denom, 2);
  const commentRate = round(comments.length / denom, 2);
  const eventAttendanceRate = round(rsvps.length / denom, 2);
  const connectionRate = round(connections.length / denom, 2);

  // ------------------------------------------------------------------
  // 5. Per-member engagement scores
  // ------------------------------------------------------------------
  const memberScoreMap = new Map<string, ScoreBreakdown>();

  for (const m of members) {
    memberScoreMap.set(m.id, {
      posts: 0,
      comments: 0,
      postLikes: 0,
      eventRsvps: 0,
      connections: 0,
      activeDays: 0,
    });
  }

  for (const p of posts) {
    const b = memberScoreMap.get(p.author_id);
    if (b) b.posts += 1;
  }
  for (const c of comments) {
    const b = memberScoreMap.get(c.author_id);
    if (b) b.comments += 1;
  }
  for (const l of likes) {
    const b = memberScoreMap.get(l.user_id);
    if (b) b.postLikes += 1;
  }
  for (const r of rsvps) {
    const b = memberScoreMap.get(r.user_id);
    if (b) b.eventRsvps += 1;
  }
  for (const conn of connections) {
    const bReq = memberScoreMap.get(conn.requester_id);
    if (bReq) bReq.connections += 1;
    const bRec = memberScoreMap.get(conn.recipient_id);
    if (bRec) bRec.connections += 1;
  }

  // Active days: count distinct dates from last_active_at within window
  // (we only have a single timestamp, so we count 1 if active at all)
  for (const m of members) {
    const b = memberScoreMap.get(m.id);
    if (b && m.last_active_at && m.last_active_at >= cutoff) {
      b.activeDays = 1;
    }
  }

  const memberScores: MemberEngagementScore[] = members.map((m) => {
    const b = memberScoreMap.get(m.id)!;
    const score =
      b.posts * W.POST_CREATED +
      b.comments * W.COMMENT_CREATED +
      b.postLikes * W.POST_LIKED +
      b.eventRsvps * W.EVENT_RSVP +
      b.connections * W.CONNECTION_MADE +
      b.activeDays * W.ACTIVE_DAY;

    return {
      userId: m.id,
      fullName: m.full_name,
      avatarUrl: m.avatar_url,
      score,
      tier: tierFromScore(score),
      breakdown: b,
    };
  });

  // Tier distribution
  const scoreTierDistribution: ScoreTierDistribution = {
    inactive: 0,
    low: 0,
    moderate: 0,
    active: 0,
    highlyActive: 0,
  };
  for (const ms of memberScores) {
    switch (ms.tier) {
      case 'inactive':
        scoreTierDistribution.inactive += 1;
        break;
      case 'low':
        scoreTierDistribution.low += 1;
        break;
      case 'moderate':
        scoreTierDistribution.moderate += 1;
        break;
      case 'active':
        scoreTierDistribution.active += 1;
        break;
      case 'highly_active':
        scoreTierDistribution.highlyActive += 1;
        break;
    }
  }

  // Average score
  const avgEngagementScore =
    memberScores.length > 0
      ? round(
          memberScores.reduce((sum, ms) => sum + ms.score, 0) /
            memberScores.length,
          1
        )
      : 0;

  // Top N
  const topMembers = [...memberScores]
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  const metrics: ChapterEngagementMetrics = {
    chapterId,
    chapterName,
    windowDays,
    totalMembers,
    activeMembers: activeMembersInWindow,
    dauWauRatio,
    postCreationRate,
    commentRate,
    eventAttendanceRate,
    connectionRate,
    avgEngagementScore,
    scoreTierDistribution,
  };

  return { metrics, topMembers };
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
