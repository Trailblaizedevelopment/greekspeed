import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { canManageChapterForContext } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// For GET requests - no auth required (public data)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    // Use service role for reading (public data)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: chapter, error } = await supabase
      .from('spaces')
      .select('starting_budget')
      .eq('id', chapterId)
      .single();

    if (error) {
      console.error('Error fetching chapter budget:', error);
      return NextResponse.json({ error: 'Failed to fetch budget' }, { status: 500 });
    }

    // Default to 12000 if not set
    const startingBudget = chapter?.starting_budget ?? 12000;

    return NextResponse.json({ starting_budget: parseFloat(String(startingBudget)) });
  } catch (error) {
    console.error('Error in budget GET API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// For PATCH requests - requires auth and permissions
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { chapter_id, starting_budget } = body;

    if (!chapter_id || starting_budget === undefined) {
      return NextResponse.json({ error: 'Chapter ID and starting budget are required' }, { status: 400 });
    }

    // Validate starting_budget is a positive number
    const budgetValue = parseFloat(String(starting_budget));
    if (isNaN(budgetValue) || budgetValue < 0) {
      return NextResponse.json({ error: 'Starting budget must be a positive number' }, { status: 400 });
    }

    // Get authenticated user
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
      .select('role, chapter_id, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }

    if (!canManageChapterForContext(profile, chapter_id, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Update the chapter's starting budget
    const { createClient } = await import('@supabase/supabase-js');
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: updatedChapter, error: updateError } = await adminSupabase
      .from('spaces')
      .update({ 
        starting_budget: budgetValue,
        updated_at: new Date().toISOString()
      })
      .eq('id', chapter_id)
      .select('starting_budget')
      .single();

    if (updateError) {
      console.error('Error updating chapter budget:', updateError);
      return NextResponse.json({ error: 'Failed to update budget' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      starting_budget: parseFloat(String(updatedChapter.starting_budget)) 
    });
  } catch (error) {
    console.error('Error in budget PATCH API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

