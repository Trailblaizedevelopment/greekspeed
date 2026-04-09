import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { canManageChapterForContext } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

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

const patchCycleBodySchema = z.object({
  crowded_collection_id: z.union([z.string().uuid(), z.null()]),
});

/**
 * PATCH /api/dues/cycles/:id — update cycle fields (e.g. link Crowded collection for member checkout).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: cycleId } = await params;
    if (!cycleId?.trim()) {
      return NextResponse.json({ error: 'Invalid cycle id' }, { status: 400 });
    }

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

    const parsed = patchCycleBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await supabase
      .from('dues_cycles')
      .select('id, chapter_id')
      .eq('id', cycleId.trim())
      .maybeSingle();

    if (fetchError || !existing?.chapter_id) {
      return NextResponse.json({ error: 'Dues cycle not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }

    if (!canManageChapterForContext(profile, existing.chapter_id, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { data: cycle, error: updateError } = await supabase
      .from('dues_cycles')
      .update({
        crowded_collection_id: parsed.data.crowded_collection_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cycleId.trim())
      .select()
      .single();

    if (updateError) {
      console.error('Error updating dues cycle:', updateError);
      return NextResponse.json(
        { error: 'Failed to update dues cycle', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ cycle });
  } catch (error) {
    console.error('PATCH /api/dues/cycles/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
