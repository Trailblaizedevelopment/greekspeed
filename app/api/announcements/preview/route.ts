import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { canSendEmailNotification } from '@/lib/utils/checkEmailPreferences';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { canManageChapterForContext, type ProfileForPermission } from '@/lib/permissions';
import type { ChapterRecipientCounts, RecipientPreviewResponse } from '@/types/announcements';

export const maxDuration = 60;

/**
 * POST /api/announcements/preview
 *
 * Returns per-chapter recipient counts for a set of target chapters
 * without sending anything (dry-run preview for multi-chapter broadcast).
 *
 * Body: { chapter_ids: string[] }
 * Governance users must supply IDs within their managed set.
 * Chapter admins may only preview their own chapter.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, chapter_role, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 400 });
    }

    const body = await request.json();
    const { chapter_ids } = body;

    if (!Array.isArray(chapter_ids) || chapter_ids.length === 0) {
      return NextResponse.json({ error: 'chapter_ids must be a non-empty array of strings' }, { status: 400 });
    }

    if (!chapter_ids.every((id: unknown) => typeof id === 'string' && id.length > 0)) {
      return NextResponse.json({ error: 'Each chapter_id must be a non-empty string' }, { status: 400 });
    }

    const isGovernance = profile.role === 'governance';

    let managedIds: string[] | undefined;
    if (isGovernance) {
      managedIds = await getManagedChapterIds(supabase, user.id);
    }

    const profileForPerm: ProfileForPermission = {
      role: profile.role,
      chapter_id: profile.chapter_id,
      chapter_role: profile.chapter_role,
    };

    for (const chapterId of chapter_ids) {
      if (!canManageChapterForContext(profileForPerm, chapterId, managedIds)) {
        return NextResponse.json(
          { error: `Not authorized to manage chapter ${chapterId}` },
          { status: 403 }
        );
      }
    }

    const { data: chapters, error: chaptersError } = await supabase
      .from('spaces')
      .select('id, name')
      .in('id', chapter_ids);

    if (chaptersError || !chapters) {
      return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 });
    }

    const chapterNameMap = new Map(chapters.map((c) => [c.id, c.name as string]));

    const chapterCounts: ChapterRecipientCounts[] = await Promise.all(
      chapter_ids.map(async (chapterId: string) => {
        return computeRecipientCounts(supabase, chapterId, chapterNameMap.get(chapterId) || 'Unknown');
      })
    );

    const totals = chapterCounts.reduce(
      (acc, c) => ({
        sms_recipients: acc.sms_recipients + c.sms_recipients,
        alumni_sms_recipients: acc.alumni_sms_recipients + c.alumni_sms_recipients,
        email_recipients: acc.email_recipients + c.email_recipients,
        alumni_email_recipients: acc.alumni_email_recipients + c.alumni_email_recipients,
        total_members: acc.total_members + c.total_members,
        total_alumni: acc.total_alumni + c.total_alumni,
      }),
      {
        sms_recipients: 0,
        alumni_sms_recipients: 0,
        email_recipients: 0,
        alumni_email_recipients: 0,
        total_members: 0,
        total_alumni: 0,
      }
    );

    const response: RecipientPreviewResponse = { chapters: chapterCounts, totals };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Preview API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function computeRecipientCounts(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  chapterId: string,
  chapterName: string
): Promise<ChapterRecipientCounts> {
  const { data: members } = await supabase
    .from('profiles')
    .select('id, email, phone, sms_consent')
    .eq('chapter_id', chapterId)
    .in('role', ['active_member', 'admin'])
    .neq('is_developer', true);

  const { data: alumni } = await supabase
    .from('profiles')
    .select('id, email, phone, sms_consent')
    .eq('chapter_id', chapterId)
    .eq('role', 'alumni')
    .neq('is_developer', true);

  const membersList = members || [];
  const alumniList = alumni || [];

  let emailCount = 0;
  for (const member of membersList) {
    if (member.email) {
      try {
        const allowed = await canSendEmailNotification(member.id, 'announcement');
        if (allowed) emailCount++;
      } catch { /* skip */ }
    }
  }

  const smsCount = membersList.filter(
    (m) => m.phone && m.phone.trim() !== '' && m.sms_consent === true
  ).length;

  let alumniEmailCount = 0;
  for (const alum of alumniList) {
    if (alum.email) {
      try {
        const allowed = await canSendEmailNotification(alum.id, 'announcement');
        if (allowed) alumniEmailCount++;
      } catch { /* skip */ }
    }
  }

  const alumniSmsCount = alumniList.filter(
    (a) => a.phone && a.phone.trim() !== '' && a.sms_consent === true
  ).length;

  return {
    chapter_id: chapterId,
    chapter_name: chapterName,
    sms_recipients: smsCount,
    alumni_sms_recipients: alumniSmsCount,
    email_recipients: emailCount,
    alumni_email_recipients: alumniEmailCount,
    total_members: membersList.length,
    total_alumni: alumniList.length,
  };
}
