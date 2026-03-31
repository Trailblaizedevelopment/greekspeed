import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import type { NetworkKpis } from '@/types/governance';

/**
 * Engagement formula (product default — subject to confirmation):
 *
 *   avgEngagementPercent = MAU / registeredMembers * 100
 *
 * Where:
 *   MAU  = profiles with `last_active_at` within the past 30 days
 *          whose `member_status` is NOT 'graduated'
 *   registeredMembers = all non-graduated profiles in the managed chapters
 *
 * The metric is averaged across chapters (per-chapter engagement, then mean)
 * so that small chapters are not drowned out by large ones.
 *
 * TODO: confirm numerator/denominator with product (see TRA-553 notes).
 */
const ENGAGEMENT_WINDOW_DAYS = 30;

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
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
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.role !== 'governance') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const chapterIds = await getManagedChapterIds(supabase, user.id);

    if (chapterIds.length === 0) {
      const empty: NetworkKpis = {
        chapterCount: 0,
        totalActiveMembers: 0,
        totalAlumni: 0,
        avgEngagementPercent: 0,
      };
      return NextResponse.json(empty);
    }

    const { data: members, error: membersError } = await supabase
      .from('profiles')
      .select('id, chapter_id, member_status, last_active_at')
      .in('chapter_id', chapterIds);

    if (membersError) {
      console.error('network-kpis members query error:', membersError);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    const rows = members ?? [];

    const totalActiveMembers = rows.filter(
      (m) => m.member_status === 'active'
    ).length;

    const totalAlumni = rows.filter(
      (m) => m.member_status === 'alumni' || m.member_status === 'graduated'
    ).length;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ENGAGEMENT_WINDOW_DAYS);
    const cutoffISO = cutoff.toISOString();

    const chapterEngagements: number[] = chapterIds.map((cid) => {
      const chapterMembers = rows.filter(
        (m) => m.chapter_id === cid && m.member_status !== 'graduated'
      );
      if (chapterMembers.length === 0) return 0;

      const active = chapterMembers.filter(
        (m) => m.last_active_at && m.last_active_at >= cutoffISO
      ).length;

      return (active / chapterMembers.length) * 100;
    });

    const avgEngagementPercent =
      chapterEngagements.length > 0
        ? Math.round(
            (chapterEngagements.reduce((sum, v) => sum + v, 0) /
              chapterEngagements.length) *
              10
          ) / 10
        : 0;

    const kpis: NetworkKpis = {
      chapterCount: chapterIds.length,
      totalActiveMembers,
      totalAlumni,
      avgEngagementPercent,
    };

    return NextResponse.json(kpis);
  } catch (error) {
    console.error('network-kpis API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
