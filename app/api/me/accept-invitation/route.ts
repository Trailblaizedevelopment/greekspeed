import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { validateInvitationToken, hasEmailUsedInvitation, recordInvitationUsage } from '@/lib/utils/invitationUtils';
import { createPendingMembershipRequest } from '@/lib/services/membershipRequestService';
import { notifyChapterAdminsOfNewMembershipRequest } from '@/lib/services/membershipRequestNotificationService';
import { upsertSpaceMembership } from '@/lib/services/spaceMembershipService';

/**
 * TRA-661: Authenticated endpoint for a signed-in user to accept an invitation
 * for a second (or additional) chapter without WRONG_CHAPTER blocking.
 *
 * POST /api/me/accept-invitation
 * Body: { token: string }
 *
 * Behavior:
 * - If invitation.approval_mode === 'pending': creates a membership request
 * - If invitation.approval_mode === 'auto': directly creates a space_membership row
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const authToken = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    const validation = await validateInvitationToken(token);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const invitation = validation.invitation!;

    // Check if user's email has already used this invitation
    const hasUsed = await hasEmailUsedInvitation(invitation.id, user.email ?? '');
    if (hasUsed) {
      return NextResponse.json(
        { error: 'You have already used this invitation' },
        { status: 400 }
      );
    }

    // Fetch the user's profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, chapter_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Check if already a member of the target chapter
    if (profile.chapter_id === invitation.chapter_id) {
      return NextResponse.json(
        { error: 'You are already a member of this chapter', code: 'ALREADY_MEMBER' },
        { status: 409 }
      );
    }

    // Check space_memberships for existing membership
    const { data: existingMembership } = await supabase
      .from('space_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('space_id', invitation.chapter_id)
      .neq('status', 'inactive')
      .maybeSingle();

    if (existingMembership) {
      return NextResponse.json(
        { error: 'You already have an active membership in this chapter', code: 'ALREADY_MEMBER' },
        { status: 409 }
      );
    }

    const pendingExecApproval = invitation.approval_mode === 'pending';
    const targetRole =
      invitation.invitation_type === 'alumni' ? 'alumni' : 'active_member';

    if (pendingExecApproval) {
      const queueResult = await createPendingMembershipRequest(supabase, {
        userId: user.id,
        chapterId: invitation.chapter_id,
        source: 'invitation',
        invitationId: invitation.id,
      });

      if (!queueResult.ok) {
        const status =
          queueResult.code === 'ALREADY_MEMBER'
            ? 409
            : queueResult.code === 'DUPLICATE_PENDING'
              ? 400
              : 500;
        return NextResponse.json(
          { error: queueResult.message, code: queueResult.code },
          { status }
        );
      }

      notifyChapterAdminsOfNewMembershipRequest(supabase, {
        requestId: queueResult.data.id,
        chapterId: invitation.chapter_id,
        applicantUserId: user.id,
      });

      // Record invitation usage
      await recordInvitationUsage(
        invitation.id,
        user.email ?? '',
        user.id
      );

      return NextResponse.json({
        success: true,
        needs_approval: true,
        chapter_id: invitation.chapter_id,
        chapter_name: validation.chapter_name,
      });
    }

    // Auto-approval: directly create space membership
    const isFirstChapter = !profile.chapter_id;
    const membershipResult = await upsertSpaceMembership(supabase, {
      userId: user.id,
      spaceId: invitation.chapter_id,
      role: targetRole,
      status: targetRole === 'alumni' ? 'alumni' : 'active',
      isPrimary: isFirstChapter,
    });

    if (!membershipResult.ok) {
      return NextResponse.json(
        {
          error: membershipResult.error || 'Failed to create membership',
        },
        { status: 500 }
      );
    }

    // If this is the user's first chapter, also set profiles.chapter_id
    if (isFirstChapter) {
      await supabase
        .from('profiles')
        .update({
          chapter_id: invitation.chapter_id,
          chapter: validation.chapter_name,
          role: targetRole,
          member_status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    }

    // Record invitation usage
    await recordInvitationUsage(
      invitation.id,
      user.email ?? '',
      user.id
    );

    return NextResponse.json({
      success: true,
      needs_approval: false,
      chapter_id: invitation.chapter_id,
      chapter_name: validation.chapter_name,
    });
  } catch (error) {
    console.error('accept-invitation API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
