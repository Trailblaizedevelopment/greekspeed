import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { canManageChapterForContext } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { bulkAssignMembersToNewCycle } from '@/lib/services/dues/bulkAssignMembersToNewCycle';
import { deleteDuesCycleByIdAdmin } from '@/lib/services/dues/deleteDuesCycleAdmin';
import { duesCyclePostBodySchema } from '@/lib/services/dues/duesCyclePostBodySchema';
import { maybeSyncCrowdedChapterContacts } from '@/lib/services/crowded/maybeSyncCrowdedChapterContacts';
import { createCrowdedCollectionAndLinkDuesCycle } from '@/lib/services/dues/linkCrowdedCollectionForDuesCycle';
import { isFeatureEnabled } from '@/types/featureFlags';

/** Session-aware client for Route Handlers (reads auth from request cookies). */
function createApiSupabaseClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId') || profile.chapter_id;

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter context required' }, { status: 400 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }

    if (!canManageChapterForContext(profile, chapterId, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get dues cycles for the chapter
    const { data: cycles, error } = await supabase
      .from('dues_cycles')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching dues cycles:', error);
      return NextResponse.json({ error: 'Failed to fetch dues cycles' }, { status: 500 });
    }

    return NextResponse.json({ cycles: cycles || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = duesCyclePostBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const chapterId =
      typeof body.chapterId === 'string' && body.chapterId.trim().length > 0
        ? body.chapterId.trim()
        : profile.chapter_id?.trim() ?? '';

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter context required' }, { status: 400 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }

    if (!canManageChapterForContext(profile, chapterId, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const baseAmountNum = body.base_amount;
    if (!Number.isFinite(baseAmountNum) || baseAmountNum < 0) {
      return NextResponse.json({ error: 'Valid base amount is required' }, { status: 400 });
    }

    if (body.linkCrowded) {
      const { data: chapterRow, error: chErr } = await supabase
        .from('chapters')
        .select('feature_flags, crowded_chapter_id')
        .eq('id', chapterId)
        .maybeSingle();

      if (chErr || !chapterRow) {
        return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
      }

      const crowdedReady =
        isFeatureEnabled(chapterRow.feature_flags, 'crowded_integration_enabled') &&
        Boolean((chapterRow.crowded_chapter_id as string | null)?.trim());

      if (!crowdedReady) {
        return NextResponse.json(
          {
            error:
              'Crowded online checkout is not enabled or the chapter is not linked to Crowded. Turn off “Link Crowded collection” or finish Crowded setup.',
          },
          { status: 400 }
        );
      }
    }

    const insertRow: Record<string, unknown> = {
      chapter_id: chapterId,
      name: body.name,
      start_date: new Date().toISOString().split('T')[0],
      due_date: body.due_date,
      close_date: body.close_date ?? null,
      base_amount: baseAmountNum,
      allow_payment_plans: body.allow_payment_plans,
      plan_options: body.plan_options ?? [],
      late_fee_policy: body.late_fee_policy ?? null,
      status: 'active',
    };
    if (body.description?.trim()) {
      insertRow.description = body.description.trim();
    }

    const { data: cycle, error: cycleError } = await supabase
      .from('dues_cycles')
      .insert(insertRow)
      .select()
      .single();

    if (cycleError) {
      console.error('❌ Error creating dues cycle:', cycleError);
      return NextResponse.json(
        {
          error: 'Failed to create dues cycle',
          details: cycleError.message,
        },
        { status: 500 }
      );
    }

    if (!cycle?.id) {
      return NextResponse.json({ error: 'Failed to create dues cycle' }, { status: 500 });
    }

    let crowdedLinked = false;
    if (body.linkCrowded) {
      const requestedCents = Math.max(1, Math.round(baseAmountNum * 100));
      const linkRes = await createCrowdedCollectionAndLinkDuesCycle({
        request,
        trailblaizeChapterId: chapterId,
        duesCycleId: cycle.id,
        collectionTitle: body.name,
        requestedAmountCents: requestedCents,
      });

      if (!linkRes.ok) {
        await deleteDuesCycleByIdAdmin(cycle.id);
        return linkRes.response;
      }
      crowdedLinked = true;
      cycle.crowded_collection_id = linkRes.collectionId;
    }

    let assignmentSummary: { created: number; skipped: number; errors: string[] } | null = null;
    if (body.assignMemberIds.length > 0) {
      assignmentSummary = await bulkAssignMembersToNewCycle({
        supabase,
        chapterId,
        duesCycleId: cycle.id,
        memberIds: body.assignMemberIds,
        cycleBaseAmount: baseAmountNum,
      });
      await maybeSyncCrowdedChapterContacts({
        supabase,
        trailblaizeChapterId: chapterId,
        memberIds: body.assignMemberIds,
      });
    }

    return NextResponse.json({
      message: 'Dues cycle created successfully',
      cycle,
      crowdedLinked,
      assignmentSummary: assignmentSummary ?? { created: 0, skipped: 0, errors: [] },
    });
  } catch (error) {
    console.error('❌ API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
