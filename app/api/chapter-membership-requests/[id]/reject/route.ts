import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getMembershipRequestById,
  rejectMembershipRequest,
} from '@/lib/services/membershipRequestService';
import { authenticateAdminForChapterMembership } from '@/lib/api/chapterMembershipRequestsAdminAuth';
import { membershipRequestServiceErrorResponse } from '@/lib/api/membershipRequestHttpErrors';
import {
  membershipRequestIdParamSchema,
  rejectMembershipRequestBodySchema,
} from '@/lib/validation/chapterMembershipRequests';
import { notifyApplicantOfMembershipDecision } from '@/lib/services/membershipRequestNotificationService';

/**
 * POST — reject a pending membership request (admin / exec / governance).
 * TRA-574
 */
export async function POST(
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

    const membershipRow = await getMembershipRequestById(supabase, requestId);
    if (!membershipRow) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const auth = await authenticateAdminForChapterMembership(
      request,
      membershipRow.chapter_id,
      supabase
    );
    if (!auth.ok) {
      return auth.response;
    }

    const json = await request.json().catch(() => ({}));
    const bodyParsed = rejectMembershipRequestBodySchema.safeParse(json);
    if (!bodyParsed.success) {
      const message = bodyParsed.error.issues.map((e) => e.message).join('; ');
      return NextResponse.json({ error: message || 'Invalid request body' }, { status: 400 });
    }

    const result = await rejectMembershipRequest(supabase, {
      requestId,
      resolvedByUserId: auth.userId,
      rejectionReason: bodyParsed.data.rejectionReason ?? null,
    });

    if (!result.ok) {
      return membershipRequestServiceErrorResponse(result.code, result.message);
    }

    notifyApplicantOfMembershipDecision(supabase, {
      applicantUserId: result.data.user_id,
      chapterId: result.data.chapter_id,
      approved: false,
      rejectionReason: result.data.rejection_reason,
    });

    return NextResponse.json({ data: result.data });
  } catch (error) {
    console.error('POST /api/chapter-membership-requests/[id]/reject:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
