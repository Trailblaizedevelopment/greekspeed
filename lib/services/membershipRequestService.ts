import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChapterMembershipRequest,
  ChapterMembershipRequestSource,
} from '@/types/chapterMembershipRequests';
import type { InvitationType } from '@/types/invitations';
import { recordInvitationUsage } from '@/lib/utils/invitationUtils';

/**
 * Chapter membership approval queue (TRA-571).
 * Callers should pass a service-role Supabase client from API routes so RLS does not block exec workflows.
 */

export type MembershipRequestServiceErrorCode =
  | 'NOT_FOUND'
  | 'NOT_PENDING'
  | 'INVALID_STATE'
  | 'DUPLICATE_PENDING'
  | 'ALREADY_MEMBER'
  | 'WRONG_CHAPTER'
  | 'INVITATION_REQUIRED'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_CHAPTER_MISMATCH'
  | 'INVITATION_USAGE_FAILED'
  | 'PROFILE_UPDATE_FAILED'
  | 'REQUEST_UPDATE_FAILED'
  | 'ALUMNI_SYNC_FAILED';

export type MembershipRequestServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: MembershipRequestServiceErrorCode; message: string };

export interface CreatePendingMembershipRequestInput {
  userId: string;
  chapterId: string;
  source: ChapterMembershipRequestSource;
  /** Required when source is invitation */
  invitationId?: string | null;
}

export interface ApproveMembershipRequestInput {
  requestId: string;
  resolvedByUserId: string;
}

export interface RejectMembershipRequestInput {
  requestId: string;
  resolvedByUserId: string;
  rejectionReason?: string | null;
}

function mapInvitationTypeToProfileRole(
  invitationType: InvitationType
): 'alumni' | 'active_member' {
  return invitationType === 'alumni' ? 'alumni' : 'active_member';
}

async function fetchPendingDuplicate(
  supabase: SupabaseClient,
  userId: string,
  chapterId: string
): Promise<ChapterMembershipRequest | null> {
  const { data, error } = await supabase
    .from('chapter_membership_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('chapter_id', chapterId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error || !data) return null;
  return data as ChapterMembershipRequest;
}

async function syncAlumniRecord(params: {
  supabase: SupabaseClient;
  userId: string;
  chapterName: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  gradYear: number;
  existingAvatarUrl: string | null;
}): Promise<MembershipRequestServiceResult<void>> {
  const nowIso = new Date().toISOString();

  const { data: existingAlumni, error: fetchAlumniError } = await params.supabase
    .from('alumni')
    .select(
      'description, avatar_url, verified, is_actively_hiring, last_contact, tags, mutual_connections, created_at'
    )
    .eq('user_id', params.userId)
    .maybeSingle();

  if (fetchAlumniError) {
    return {
      ok: false,
      code: 'ALUMNI_SYNC_FAILED',
      message: fetchAlumniError.message,
    };
  }

  const alumniPayload = {
    user_id: params.userId,
    first_name: params.firstName,
    last_name: params.lastName,
    full_name: params.fullName,
    chapter: params.chapterName,
    industry: 'Not specified',
    graduation_year: params.gradYear,
    company: 'Not specified',
    job_title: 'Not specified',
    email: params.email,
    phone: params.phone,
    location: 'Not specified',
    linkedin_url: params.linkedinUrl,
    description: existingAlumni?.description ?? `Alumni from ${params.chapterName}`,
    avatar_url: existingAlumni?.avatar_url ?? params.existingAvatarUrl,
    verified: existingAlumni?.verified ?? false,
    is_actively_hiring: existingAlumni?.is_actively_hiring ?? false,
    last_contact: existingAlumni?.last_contact ?? null,
    tags: existingAlumni?.tags ?? null,
    mutual_connections: existingAlumni?.mutual_connections ?? [],
    created_at: existingAlumni?.created_at ?? nowIso,
    updated_at: nowIso,
  };

  const { error: alumniError } = await params.supabase
    .from('alumni')
    .upsert(alumniPayload, { onConflict: 'user_id' });

  if (alumniError) {
    return {
      ok: false,
      code: 'ALUMNI_SYNC_FAILED',
      message: alumniError.message,
    };
  }

  return { ok: true, data: undefined };
}

/**
 * Insert a pending row. Idempotent: duplicate pending for same user+chapter returns the existing row (unique partial index).
 *
 * TRA-585: After a request is **rejected**, the partial unique index no longer applies (it only covers `status = pending`),
 * so the applicant may submit a new pending row for the same chapter.
 */
export async function createPendingMembershipRequest(
  supabase: SupabaseClient,
  input: CreatePendingMembershipRequestInput
): Promise<MembershipRequestServiceResult<ChapterMembershipRequest>> {
  if (input.source === 'invitation' && !input.invitationId) {
    return {
      ok: false,
      code: 'INVITATION_REQUIRED',
      message: 'invitationId is required when source is invitation',
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, chapter_id, first_name, last_name, phone, linkedin_url, avatar_url, grad_year, major, location'
    )
    .eq('id', input.userId)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Applicant profile not found',
    };
  }

  if (profile.chapter_id && profile.chapter_id === input.chapterId) {
    return {
      ok: false,
      code: 'ALREADY_MEMBER',
      message: 'User is already assigned to this chapter',
    };
  }

  // TRA-661: Check space_memberships for existing membership in target chapter
  const { data: existingMembership } = await supabase
    .from('space_memberships')
    .select('id, status')
    .eq('user_id', input.userId)
    .eq('space_id', input.chapterId)
    .neq('status', 'inactive')
    .maybeSingle();

  if (existingMembership) {
    return {
      ok: false,
      code: 'ALREADY_MEMBER',
      message: 'User already has an active membership in this chapter',
    };
  }

  // TRA-661: Users with an existing chapter_id may create a pending request for a different space

  const row = {
    user_id: input.userId,
    chapter_id: input.chapterId,
    status: 'pending' as const,
    source: input.source,
    invitation_id: input.invitationId ?? null,
    applicant_email: profile.email ?? null,
    applicant_full_name: profile.full_name ?? null,
  };

  const { data, error } = await supabase
    .from('chapter_membership_requests')
    .insert(row)
    .select('*')
    .single();

  if (error?.code === '23505') {
    const existing = await fetchPendingDuplicate(
      supabase,
      input.userId,
      input.chapterId
    );
    if (existing) return { ok: true, data: existing };
    return {
      ok: false,
      code: 'DUPLICATE_PENDING',
      message: 'A pending request already exists for this user and chapter',
    };
  }

  if (error || !data) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: error?.message ?? 'Failed to create membership request',
    };
  }

  return { ok: true, data: data as ChapterMembershipRequest };
}

/**
 * Pending requests for a chapter, oldest first.
 */
export async function listPendingMembershipRequestsForChapter(
  supabase: SupabaseClient,
  chapterId: string
): Promise<ChapterMembershipRequest[]> {
  const { data, error } = await supabase
    .from('chapter_membership_requests')
    .select('*')
    .eq('chapter_id', chapterId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('listPendingMembershipRequestsForChapter:', error);
    return [];
  }

  return (data ?? []) as ChapterMembershipRequest[];
}

export async function getMembershipRequestById(
  supabase: SupabaseClient,
  requestId: string
): Promise<ChapterMembershipRequest | null> {
  const { data, error } = await supabase
    .from('chapter_membership_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ChapterMembershipRequest;
}

/**
 * Approve: for invitation-sourced requests, record invitation usage before assigning chapter; then update profile,
 * sync alumni when role is alumni, then mark request approved.
 * Idempotent if already approved for this chapter. Profile onboarding flags are not flipped here — applicants continue normal onboarding when incomplete.
 */
export async function approveMembershipRequest(
  supabase: SupabaseClient,
  input: ApproveMembershipRequestInput
): Promise<MembershipRequestServiceResult<ChapterMembershipRequest>> {
  const request = await getMembershipRequestById(supabase, input.requestId);
  if (!request) {
    return { ok: false, code: 'NOT_FOUND', message: 'Request not found' };
  }

  if (request.status === 'approved') {
    // TRA-661: Check space_memberships or profile.chapter_id for idempotency
    const { data: membership } = await supabase
      .from('space_memberships')
      .select('id')
      .eq('user_id', request.user_id)
      .eq('space_id', request.chapter_id)
      .neq('status', 'inactive')
      .maybeSingle();

    if (membership) {
      return { ok: true, data: request };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('chapter_id')
      .eq('id', request.user_id)
      .maybeSingle();
    if (profile?.chapter_id === request.chapter_id) {
      return { ok: true, data: request };
    }

    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'Request was approved but membership is inconsistent',
    };
  }

  if (request.status !== 'pending') {
    return {
      ok: false,
      code: 'NOT_PENDING',
      message: 'Only pending requests can be approved',
    };
  }

  const { data: chapter, error: chapterError } = await supabase
    .from('spaces')
    .select('id, name')
    .eq('id', request.chapter_id)
    .maybeSingle();

  if (chapterError || !chapter) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Chapter not found',
    };
  }

  let targetRole: 'alumni' | 'active_member';
  /** TRA-596: snapshot for recordInvitationUsage before chapter assignment (pending invite accept skips usage on signup). */
  let linkedInvitation: {
    id: string;
    usage_count: number;
  } | null = null;

  if (request.source === 'marketing_alumni') {
    targetRole = 'alumni';
  } else {
    if (!request.invitation_id) {
      return {
        ok: false,
        code: 'INVITATION_REQUIRED',
        message: 'Invitation request is missing invitation_id',
      };
    }
    const { data: invitation, error: invErr } = await supabase
      .from('invitations')
      .select('id, chapter_id, invitation_type, usage_count')
      .eq('id', request.invitation_id)
      .maybeSingle();

    if (invErr || !invitation) {
      return {
        ok: false,
        code: 'INVITATION_NOT_FOUND',
        message: 'Linked invitation not found',
      };
    }

    if (invitation.chapter_id !== request.chapter_id) {
      return {
        ok: false,
        code: 'INVITATION_CHAPTER_MISMATCH',
        message: 'Invitation chapter does not match request',
      };
    }

    linkedInvitation = {
      id: invitation.id,
      usage_count:
        typeof invitation.usage_count === 'number' ? invitation.usage_count : 0,
    };

    targetRole = mapInvitationTypeToProfileRole(
      invitation.invitation_type as InvitationType
    );
  }

  const { data: profile, error: profileFetchError } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, first_name, last_name, phone, linkedin_url, avatar_url, grad_year, major, location, chapter_id'
    )
    .eq('id', request.user_id)
    .maybeSingle();

  if (profileFetchError || !profile) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Applicant profile not found',
    };
  }

  // TRA-661: Allow approval even if user already has a different primary chapter (multi-membership)
  const isFirstChapter = !profile.chapter_id;

  const nowIso = new Date().toISOString();
  const currentYear = new Date().getFullYear();

  const firstName =
    (profile.first_name as string | null)?.trim() ||
    profile.full_name?.split(/\s+/)[0] ||
    'Member';
  const lastName =
    (profile.last_name as string | null)?.trim() ||
    profile.full_name?.split(/\s+/).slice(1).join(' ') ||
    '';
  const fullName =
    profile.full_name?.trim() || `${firstName} ${lastName}`.trim();

  const effectiveGradYear =
    typeof profile.grad_year === 'number' && profile.grad_year > 0
      ? profile.grad_year
      : currentYear;

  if (request.source === 'invitation' && linkedInvitation) {
    const usageResult = await recordInvitationUsage(
      linkedInvitation.id,
      profile.email ?? '',
      request.user_id,
      linkedInvitation.usage_count
    );
    if (!usageResult.success) {
      return {
        ok: false,
        code: 'INVITATION_USAGE_FAILED',
        message:
          usageResult.error ?? 'Failed to record invitation usage on approval',
      };
    }
  }

  // TRA-661: Only set profiles.chapter_id if this is the user's first chapter (primary)
  if (isFirstChapter) {
    const profileUpdate: Record<string, unknown> = {
      chapter_id: chapter.id,
      chapter: chapter.name,
      role: targetRole,
      member_status: 'active',
      updated_at: nowIso,
    };

    if (targetRole === 'alumni' && !profile.grad_year) {
      profileUpdate.grad_year = effectiveGradYear;
    }

    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', request.user_id);

    if (profileUpdateError) {
      return {
        ok: false,
        code: 'PROFILE_UPDATE_FAILED',
        message: profileUpdateError.message,
      };
    }
  }

  // TRA-661: Always upsert a space_memberships row on approval
  const membershipStatus = targetRole === 'alumni' ? 'alumni' : 'active';
  const { error: membershipError } = await supabase
    .from('space_memberships')
    .upsert(
      {
        user_id: request.user_id,
        space_id: chapter.id,
        role: targetRole,
        status: membershipStatus,
        is_primary: isFirstChapter,
        updated_at: nowIso,
      },
      { onConflict: 'user_id,space_id' }
    );

  if (membershipError) {
    console.error('TRA-661: Failed to upsert space_membership on approval:', membershipError);
  }

  if (targetRole === 'alumni') {
    const alumniResult = await syncAlumniRecord({
      supabase,
      userId: request.user_id,
      chapterName: chapter.name ?? '',
      firstName,
      lastName,
      fullName,
      email: profile.email ?? '',
      phone: (profile.phone as string | null) ?? null,
      linkedinUrl: (profile.linkedin_url as string | null) ?? null,
      gradYear: effectiveGradYear,
      existingAvatarUrl: (profile.avatar_url as string | null) ?? null,
    });
    if (!alumniResult.ok) return alumniResult;
  }

  const finalized = await finalizeApproveUpdate(
    supabase,
    request,
    input.resolvedByUserId
  );
  if (!finalized.ok) return finalized;
  return { ok: true, data: finalized.data };
}

async function finalizeApproveUpdate(
  supabase: SupabaseClient,
  request: ChapterMembershipRequest,
  resolvedByUserId: string
): Promise<MembershipRequestServiceResult<ChapterMembershipRequest>> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('chapter_membership_requests')
    .update({
      status: 'approved',
      resolved_at: nowIso,
      resolved_by: resolvedByUserId,
      rejection_reason: null,
    })
    .eq('id', request.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      code: 'REQUEST_UPDATE_FAILED',
      message: error.message,
    };
  }

  if (!data) {
    const current = await getMembershipRequestById(supabase, request.id);
    if (current?.status === 'approved') {
      return { ok: true, data: current };
    }
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'Request could not be marked approved',
    };
  }

  return { ok: true, data: data as ChapterMembershipRequest };
}

/**
 * Reject a pending request. Idempotent if already rejected.
 */
export async function rejectMembershipRequest(
  supabase: SupabaseClient,
  input: RejectMembershipRequestInput
): Promise<MembershipRequestServiceResult<ChapterMembershipRequest>> {
  const request = await getMembershipRequestById(supabase, input.requestId);
  if (!request) {
    return { ok: false, code: 'NOT_FOUND', message: 'Request not found' };
  }

  if (request.status === 'rejected') {
    return { ok: true, data: request };
  }

  if (request.status !== 'pending') {
    return {
      ok: false,
      code: 'NOT_PENDING',
      message: 'Only pending requests can be rejected',
    };
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('chapter_membership_requests')
    .update({
      status: 'rejected',
      resolved_at: nowIso,
      resolved_by: input.resolvedByUserId,
      rejection_reason: input.rejectionReason?.trim() || null,
    })
    .eq('id', input.requestId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      code: 'REQUEST_UPDATE_FAILED',
      message: error.message,
    };
  }

  if (!data) {
    const current = await getMembershipRequestById(supabase, input.requestId);
    if (current?.status === 'rejected') {
      return { ok: true, data: current };
    }
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: 'Request could not be marked rejected',
    };
  }

  return { ok: true, data: data as ChapterMembershipRequest };
}

/**
 * Most recent pending request for the user (e.g. onboarding refresh / admin reminder resend).
 * If multiple chapters ever queue pending rows, the newest wins.
 */
export async function getPendingMembershipRequestForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<ChapterMembershipRequest | null> {
  const { data, error } = await supabase
    .from('chapter_membership_requests')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getPendingMembershipRequestForUser:', error);
    return null;
  }

  return data as ChapterMembershipRequest | null;
}
