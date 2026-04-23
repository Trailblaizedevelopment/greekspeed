import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMembershipRequestById } from '@/lib/services/membershipRequestService';
import { authenticateAdminForChapterMembership } from '@/lib/api/chapterMembershipRequestsAdminAuth';
import { membershipRequestIdParamSchema } from '@/lib/validation/chapterMembershipRequests';

/**
 * GET — single membership request by id (pending only). TRA-588 deep links.
 * Caller must pass chapter access for the request’s chapter_id (same as list/approve).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const idParsed = membershipRequestIdParamSchema.safeParse(rawId);
    if (!idParsed.success) {
      const message = idParsed.error.issues.map((e) => e.message).join('; ');
      return NextResponse.json({ error: message || 'Invalid request id' }, { status: 400 });
    }
    const requestId = idParsed.data;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const row = await getMembershipRequestById(supabase, requestId);

    if (!row || row.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    const auth = await authenticateAdminForChapterMembership(
      request,
      row.chapter_id,
      supabase
    );
    if (!auth.ok) {
      return auth.response;
    }

    const { data: chapter } = await supabase
      .from('spaces')
      .select('name')
      .eq('id', row.chapter_id)
      .maybeSingle();

    return NextResponse.json({
      data: row,
      chapterName: chapter?.name ?? 'Chapter',
    });
  } catch (error) {
    console.error('GET /api/chapter-membership-requests/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
