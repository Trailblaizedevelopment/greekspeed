import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { validateInvitationToken, validateEmailDomain, hasEmailUsedInvitation, recordInvitationUsage } from '@/lib/utils/invitationUtils';
import { createPendingMembershipRequest } from '@/lib/services/membershipRequestService';
import { notifyChapterAdminsOfNewMembershipRequest } from '@/lib/services/membershipRequestNotificationService';
import { isEduEmail, EDU_SIGNUP_ERROR } from '@/lib/utils/emailUtils';
import { generateUniqueUsername, generateProfileSlug } from '@/lib/utils/usernameUtils';
import {
  ensureProfileChapterIdNullForPendingInvite,
  findProfileByEmailForInviteAccept,
} from '@/lib/services/invitationAcceptPendingProfile';
import { upsertSpaceMembership } from '@/lib/services/spaceMembershipService';
import { deriveWorkStateCodeFromLocationText } from '@/lib/alumni/workStateCode';

// New interface for alumni form data (simplified - most fields collected during onboarding)
interface AlumniJoinFormData {
  email: string;
  password: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  sms_consent?: boolean;
  // Alumni-specific fields - now optional, collected during onboarding
  industry?: string;
  company?: string;
  job_title?: string;
  graduation_year?: number;
  location?: string;
  linkedin_url?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = createServerSupabaseClient();
    const body: AlumniJoinFormData = await request.json();
    const { email, password, full_name, first_name, last_name, industry, company, job_title, graduation_year, location, linkedin_url } = body;
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Only require email, password, and name for account creation
    // Other fields will be collected during onboarding
    if (!email?.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Require at least some form of name
    if (!full_name?.trim() && !first_name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (isEduEmail(normalizedEmail)) {
      return NextResponse.json({ error: EDU_SIGNUP_ERROR }, { status: 400 });
    }

    // Build effective name values
    const effectiveFullName = full_name?.trim() || `${first_name || ''} ${last_name || ''}`.trim();
    const normalizedFullName = effectiveFullName;
    const defaultFirstName = normalizedFullName.split(' ')[0] || normalizedFullName;
    const defaultLastName = normalizedFullName.split(' ').slice(1).join(' ');
    const normalizedFirstName = (first_name ?? defaultFirstName).trim();
    const normalizedLastName = (last_name ?? defaultLastName).trim();
    
    // Alumni fields - use defaults if not provided (will be updated during onboarding)
    const normalizedIndustry = industry?.trim() || 'Not specified';
    const normalizedCompany = company?.trim() || 'Not specified';
    const normalizedJobTitle = job_title?.trim() || 'Not specified';
    const normalizedLocation = location?.trim() || 'Not specified';
    const normalizedLinkedIn = linkedin_url?.trim() || null;

    // Phone required; must be 10 digits
    if (!body.phone?.trim()) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }
    const phoneDigits = body.phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      return NextResponse.json({ error: 'Phone number must be 10 digits' }, { status: 400 });
    }

    const effectiveGradYear = graduation_year || new Date().getFullYear();
    const nowIso = new Date().toISOString();

    // Validate the invitation token
    const validation = await validateInvitationToken(token);
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error 
      }, { status: 400 });
    }

    const invitation = validation.invitation!;
    const pendingExecApproval = invitation.approval_mode === 'pending';

    // Ensure this is an alumni invitation
    if (invitation.invitation_type !== 'alumni') {
      return NextResponse.json({ 
        error: 'This invitation is not for alumni' 
      }, { status: 400 });
    }

    // Validate email domain if restricted
    if (!validateEmailDomain(normalizedEmail, invitation.email_domain_allowlist)) {
      return NextResponse.json({ 
        error: 'Email domain is not allowed for this invitation' 
      }, { status: 400 });
    }

    // Check if this email has already used this invitation
    const hasUsed = await hasEmailUsedInvitation(invitation.id, normalizedEmail);
    if (hasUsed) {
      return NextResponse.json({ 
        error: 'This email has already been used with this invitation' 
      }, { status: 400 });
    }

    const existingProfile = await findProfileByEmailForInviteAccept(supabase, normalizedEmail);
    if (existingProfile) {
      // TRA-661: Return structured response so client can direct user to sign-in + attach flow
      return NextResponse.json(
        {
          error:
            'This email already has an account. Sign in to continue, then accept the invitation from your dashboard.',
          code: 'EXISTING_ACCOUNT',
          existing_user_id: existingProfile.id,
          chapter_id: invitation.chapter_id,
          chapter_name: validation.chapter_name,
          invitation_token: token,
        },
        { status: 409 }
      );
    }

    // Create the user account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: normalizedFullName,
          first_name: normalizedFirstName,
          last_name: normalizedLastName
        }
      }
    });

    if (authError || !authData.user) {
      console.error('❌ Alumni Invitation Accept: Auth signup error:', authError);
      return NextResponse.json({ 
        error: authError?.message || 'Failed to create account' 
      }, { status: 500 });
    }

    // Wait for auth user to be fully created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Generate username
    const username = await generateUniqueUsername(supabase, normalizedFirstName, normalizedLastName, authData.user.id);
    const profileSlug = generateProfileSlug(username);

    if (pendingExecApproval) {
      const { error: pendingProfileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: authData.user.id,
            email: normalizedEmail,
            full_name: normalizedFullName,
            first_name: normalizedFirstName,
            last_name: normalizedLastName,
            username,
            profile_slug: profileSlug,
            phone: phoneDigits || null,
            sms_consent: body.sms_consent || false,
            chapter_id: null,
            chapter: validation.chapter_name ?? null,
            signup_channel: 'invitation',
            role: 'alumni',
            member_status: 'active',
            access_level: 'standard',
            is_developer: false,
            bio: null,
            onboarding_completed: false,
            created_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: 'id', ignoreDuplicates: false }
        );

      if (pendingProfileError) {
        console.error('❌ Alumni Invitation Accept (pending): Profile error:', pendingProfileError);
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('❌ Alumni Invitation Accept: Failed to clean up auth user:', deleteError);
        }
        return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
      }

      const cleared = await ensureProfileChapterIdNullForPendingInvite(supabase, authData.user.id);
      if (!cleared.ok) {
        console.error(
          '❌ Alumni Invitation Accept (pending): chapter_id could not be cleared; last chapter_id=',
          cleared.chapter_id
        );
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('❌ Alumni Invitation Accept: Failed to clean up auth user:', deleteError);
        }
        return NextResponse.json(
          {
            error:
              'We could not finish signup for pending approval (profile still tied to a chapter). Please contact support or try again.',
          },
          { status: 500 }
        );
      }

      const queueResult = await createPendingMembershipRequest(supabase, {
        userId: authData.user.id,
        chapterId: invitation.chapter_id,
        source: 'invitation',
        invitationId: invitation.id,
      });

      if (!queueResult.ok) {
        console.error('❌ Alumni Invitation Accept (pending):', queueResult.code, queueResult.message);
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('❌ Alumni Invitation Accept: Failed to clean up auth user:', deleteError);
        }
        const status =
          queueResult.code === 'ALREADY_MEMBER' || queueResult.code === 'WRONG_CHAPTER'
            ? 409
            : queueResult.code === 'DUPLICATE_PENDING'
              ? 400
              : 500;
        return NextResponse.json({ error: queueResult.message }, { status });
      }

      notifyChapterAdminsOfNewMembershipRequest(supabase, {
        requestId: queueResult.data.id,
        chapterId: invitation.chapter_id,
        applicantUserId: authData.user.id,
      });

      const { error: pendingSignInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (pendingSignInError) {
        console.error('❌ Alumni Invitation Accept: Auto sign-in failed:', pendingSignInError);
      }

      return NextResponse.json({
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          full_name: normalizedFullName,
          chapter_id: null,
          chapter: validation.chapter_name,
          role: 'alumni',
          member_status: 'active',
          needs_approval: true,
        },
      });
    }

    // Create the profile with alumni role (auto approval)
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: normalizedEmail,
        full_name: normalizedFullName,
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        username: username,
        profile_slug: profileSlug,
        phone: phoneDigits || null,
        sms_consent: body.sms_consent || false,
        chapter_id: invitation.chapter_id,
        chapter: validation.chapter_name,
        role: 'alumni', // KEY DIFFERENCE: alumni role
        member_status: 'active',
        access_level: 'standard',
        is_developer: false,
        bio: null,
        onboarding_completed: false, // Will be completed after onboarding
        created_at: nowIso,
        updated_at: nowIso
      },
      {
        onConflict: 'id',
        ignoreDuplicates: false
      }
    );

    if (profileError) {
      console.error('❌ Alumni Invitation Accept: Profile creation error:', profileError);
      console.error('❌ Alumni Invitation Accept: Profile error details:', {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint
      });
      // Clean up the auth user if profile creation fails
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
      } catch (deleteError) {
        console.error('❌ Alumni Invitation Accept: Failed to clean up auth user:', deleteError);
      }
      
      return NextResponse.json({ 
        error: 'Failed to create profile' 
      }, { status: 500 });
    }

    // Create or update alumni record
    const { data: existingAlumni, error: fetchAlumniError } = await supabase
      .from('alumni')
      .select(
        'description, avatar_url, verified, is_actively_hiring, last_contact, tags, mutual_connections, created_at'
      )
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (fetchAlumniError) {
      console.error('❌ Alumni Invitation Accept: Failed to fetch existing alumni record:', fetchAlumniError);
    }

    const alumniPayload = {
      user_id: authData.user.id,
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
      full_name: normalizedFullName,
      chapter: validation.chapter_name,
      industry: normalizedIndustry,
      graduation_year: effectiveGradYear,
      company: normalizedCompany,
      job_title: normalizedJobTitle,
      email: normalizedEmail,
      phone: phoneDigits || null,
      location: normalizedLocation,
      work_state_code: deriveWorkStateCodeFromLocationText(normalizedLocation),
      linkedin_url: normalizedLinkedIn,
      description: existingAlumni?.description ?? `Alumni from ${validation.chapter_name}`,
      avatar_url: existingAlumni?.avatar_url ?? null,
      verified: existingAlumni?.verified ?? false,
      is_actively_hiring: existingAlumni?.is_actively_hiring ?? false,
      last_contact: existingAlumni?.last_contact ?? null,
      tags: existingAlumni?.tags ?? null,
      mutual_connections: existingAlumni?.mutual_connections ?? [],
      created_at: existingAlumni?.created_at ?? nowIso,
      updated_at: nowIso
    };

    const { error: alumniError } = await supabase
      .from('alumni')
      .upsert(alumniPayload, { onConflict: 'user_id' });

    if (alumniError) {
      console.error('❌ Alumni Invitation Accept: Alumni record upsert error:', alumniError);
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
      } catch (deleteError) {
        console.error('❌ Alumni Invitation Accept: Failed to clean up auth user after alumni upsert error:', deleteError);
      }

      return NextResponse.json({ 
        error: 'Failed to store alumni profile' 
      }, { status: 500 });
    }

    // TRA-661: Create space_memberships row for the new alumni
    await upsertSpaceMembership(supabase, {
      userId: authData.user.id,
      spaceId: invitation.chapter_id,
      role: 'alumni',
      status: 'alumni',
      isPrimary: true,
    });

    // Record invitation usage
    const usageResult = await recordInvitationUsage(invitation.id, normalizedEmail, authData.user.id);
    if (!usageResult.success) {
      console.error('❌ Alumni Invitation Accept: Failed to record invitation usage:', usageResult.error);
    }

    // Sign in the user after account creation
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (signInError) {
      console.error('❌ Alumni Invitation Accept: Auto sign-in failed:', signInError);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        full_name,
        chapter_id: invitation.chapter_id,
        chapter: validation.chapter_name,
        role: 'alumni',
        member_status: 'active',
        needs_approval: false
      }
    });
  } catch (error) {
    console.error('❌ Alumni Invitation Accept: API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}