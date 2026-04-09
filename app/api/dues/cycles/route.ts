import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { canManageChapterForContext } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

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

    const body = await request.json();

    const {
      chapterId: bodyChapterId,
      name,
      base_amount,
      due_date,
      close_date,
      allow_payment_plans = false,
      plan_options = [],
      late_fee_policy = null,
    } = body;

    const chapterId =
      typeof bodyChapterId === 'string' && bodyChapterId.trim().length > 0
        ? bodyChapterId.trim()
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

    // Validate required fields
    if (!name || base_amount === undefined || base_amount === null || !due_date) {
      console.error('❌ Missing required fields:', { name, base_amount, due_date });
      return NextResponse.json({ error: 'Name, base amount, and due date are required' }, { status: 400 });
    }

    const baseAmountNum = parseFloat(String(base_amount));
    if (!Number.isFinite(baseAmountNum) || baseAmountNum < 0) {
      return NextResponse.json({ error: 'Valid base amount is required' }, { status: 400 });
    }

    // Create the dues cycle with start_date
    const { data: cycle, error: cycleError } = await supabase
      .from('dues_cycles')
      .insert({
        chapter_id: chapterId,
        name,
        start_date: new Date().toISOString().split('T')[0], // Today's date as start_date
        due_date,
        close_date: close_date || null,
        base_amount: baseAmountNum,
        allow_payment_plans,
        plan_options: plan_options || [],
        late_fee_policy: late_fee_policy || null,
        status: 'active'
      })
      .select()
      .single();

    if (cycleError) {
      console.error('❌ Error creating dues cycle:', cycleError);
      return NextResponse.json({ 
        error: 'Failed to create dues cycle', 
        details: cycleError.message 
      }, { status: 500 });
    }

    // Dues cycle created successfully

    return NextResponse.json({ 
      message: 'Dues cycle created successfully',
      cycle
    });
  } catch (error) {
    console.error('❌ API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
