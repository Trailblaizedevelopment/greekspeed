import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { getChapterEngagementMetrics } from '@/lib/services/engagementMetricsService';
import type { EngagementMetricsResponse } from '@/types/engagement';

/**
 * GET /api/engagement-metrics?chapterId=<uuid>&windowDays=30&topN=10
 *
 * Returns chapter-level engagement metrics and top-N member scores.
 * Accessible by chapter exec admins (own chapter), developers, and
 * governance users (managed chapters).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, role, is_developer, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId') ?? profile.chapter_id;
    const windowDays = Math.min(
      Math.max(parseInt(searchParams.get('windowDays') || '30', 10), 1),
      90
    );
    const topN = Math.min(
      Math.max(parseInt(searchParams.get('topN') || '10', 10), 1),
      50
    );

    if (!chapterId) {
      return NextResponse.json(
        { error: 'chapterId is required' },
        { status: 400 }
      );
    }

    // Authorisation: own chapter, developer, or governance-managed chapter
    const isDeveloper = profile.is_developer === true;
    const isOwnChapter = profile.chapter_id === chapterId;
    const isExecAdmin =
      isOwnChapter &&
      (profile.chapter_role === 'president' ||
        profile.chapter_role === 'vice_president' ||
        profile.chapter_role === 'treasurer' ||
        profile.chapter_role === 'secretary' ||
        profile.role === 'admin');

    if (!isDeveloper && !isExecAdmin) {
      if (profile.role === 'governance') {
        const managedIds = await getManagedChapterIds(supabase, user.id);
        if (!managedIds.includes(chapterId)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { metrics, topMembers } = await getChapterEngagementMetrics(
      supabase,
      chapterId,
      windowDays,
      topN
    );

    const response: EngagementMetricsResponse = {
      metrics,
      topMembers,
      computedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('engagement-metrics API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
