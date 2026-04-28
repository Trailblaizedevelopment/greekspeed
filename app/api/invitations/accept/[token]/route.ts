import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { validateInvitationToken, validateEmailDomain, hasEmailUsedInvitation, recordInvitationUsage } from '@/lib/utils/invitationUtils';
import { createPendingMembershipRequest } from '@/lib/services/membershipRequestService';
import { notifyChapterAdminsOfNewMembershipRequest } from '@/lib/services/membershipRequestNotificationService';
import { isEduEmailBlockedForSelfServeSignup, EDU_SIGNUP_ERROR } from '@/lib/utils/emailUtils';
import { generateUniqueUsername, generateProfileSlug } from '@/lib/utils/usernameUtils';
import { JoinFormData } from '@/types/invitations';
import {
  ensureProfileChapterIdNullForPendingInvite,
  findProfileByEmailForInviteAccept,
} from '@/lib/services/invitationAcceptPendingProfile';
import { upsertSpaceMembership } from '@/lib/services/spaceMembershipService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = createServerSupabaseClient();
    const body: any = await request.json();
    const { email, password, full_name, first_name, last_name, phone, graduation_year, location } = body;
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Validate required fields - only name, email, password required
    // Other fields (phone, graduation_year, major) will be collected during onboarding
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Require at least a name (full_name or first_name + last_name)
    if (!full_name && !first_name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (isEduEmailBlockedForSelfServeSignup(email)) {
      return NextResponse.json({ error: EDU_SIGNUP_ERROR }, { status: 400 });
    }

    // Phone required; must be 10 digits
    if (!phone || !phone.trim()) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      return NextResponse.json({ error: 'Phone number must be 10 digits' }, { status: 400 });
    }

    // Handle graduation_year - use default if not provided
    const currentYear = new Date().getFullYear();
    const effectiveGradYear = graduation_year || (currentYear + 4); // Default to 4 years from now

    // Handle major as string or array (optional now)
    let majorString: string;
    if (Array.isArray(body.major)) {
      majorString = body.major.filter((m: string) => m && m.trim()).join(', ');
    } else {
      majorString = body.major || 'To be updated'; // Default value
    }

    // Validate the invitation token
    const validation = await validateInvitationToken(token);
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error 
      }, { status: 400 });
    }

    const invitation = validation.invitation!;
    const pendingExecApproval = invitation.approval_mode === 'pending';

    // Validate email domain if restricted
    if (!validateEmailDomain(email, invitation.email_domain_allowlist)) {
      return NextResponse.json({ 
        error: 'Email domain is not allowed for this invitation' 
      }, { status: 400 });
    }

    // Check if this email has already used this invitation
    const hasUsed = await hasEmailUsedInvitation(invitation.id, email);
    if (hasUsed) {
      return NextResponse.json({ 
        error: 'This email has already been used with this invitation' 
      }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
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
          full_name,
          first_name: first_name || full_name.split(' ')[0],
          last_name: last_name || full_name.split(' ').slice(1).join(' ')
        }
      }
    });

    if (authError || !authData.user) {
      console.error('❌ Invitation Accept: Auth signup error:', authError);
      return NextResponse.json({ 
        error: authError?.message || 'Failed to create account' 
      }, { status: 500 });
    }

    // Wait a moment to ensure auth user is fully created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if profile was automatically created by trigger
    const { data: autoProfile, error: autoProfileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, chapter_id')
      .eq('id', authData.user.id)
      .single();

    if (autoProfileError && autoProfileError.code !== 'PGRST116') {
      console.error('❌ Invitation Accept: Error checking auto-created profile:', autoProfileError);
    }

    // Build the effective name values
    const effectiveFullName = full_name || `${first_name || ''} ${last_name || ''}`.trim();
    const effectiveFirstName = first_name || effectiveFullName.split(' ')[0] || '';
    const effectiveLastName = last_name || effectiveFullName.split(' ').slice(1).join(' ') || '';

    if (pendingExecApproval) {
      const username = await generateUniqueUsername(
        supabase,
        effectiveFirstName,
        effectiveLastName,
        authData.user.id
      );
      const profileSlug = generateProfileSlug(username);

      if (autoProfile) {
        const { error: pendingUpdateError } = await supabase
          .from('profiles')
          .update({
            username,
            profile_slug: profileSlug,
            first_name: effectiveFirstName,
            last_name: effectiveLastName,
            full_name: effectiveFullName,
            chapter_id: null,
            chapter: validation.chapter_name ?? null,
            signup_channel: 'invitation',
            role: 'active_member',
            member_status: 'active',
            welcome_seen: false,
            phone: phoneDigits || null,
            sms_consent: body.sms_consent || false,
            grad_year: effectiveGradYear,
            major: majorString.trim() || null,
            location: location?.trim() || null,
            onboarding_completed: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', authData.user.id);

        if (pendingUpdateError) {
          console.error('❌ Invitation Accept (pending): Profile update error:', pendingUpdateError);
          try {
            await supabase.auth.admin.deleteUser(authData.user.id);
          } catch (deleteError) {
            console.error('❌ Invitation Accept: Failed to clean up auth user:', deleteError);
          }
          return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
        }
      } else {
        const { error: pendingInsertError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: normalizedEmail,
            full_name: effectiveFullName,
            first_name: effectiveFirstName,
            last_name: effectiveLastName,
            username,
            profile_slug: profileSlug,
            phone: phoneDigits || null,
            sms_consent: body.sms_consent || false,
            chapter_id: null,
            chapter: validation.chapter_name ?? null,
            signup_channel: 'invitation',
            role: 'active_member',
            member_status: 'active',
            grad_year: effectiveGradYear,
            major: majorString.trim() || null,
            location: location?.trim() || null,
            onboarding_completed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (pendingInsertError) {
          console.error('❌ Invitation Accept (pending): Profile creation error:', pendingInsertError);
          try {
            await supabase.auth.admin.deleteUser(authData.user.id);
          } catch (deleteError) {
            console.error('❌ Invitation Accept: Failed to clean up auth user:', deleteError);
          }
          return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
        }
      }

      const cleared = await ensureProfileChapterIdNullForPendingInvite(supabase, authData.user.id);
      if (!cleared.ok) {
        console.error(
          '❌ Invitation Accept (pending): chapter_id could not be cleared for pending invite; last chapter_id=',
          cleared.chapter_id
        );
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('❌ Invitation Accept: Failed to clean up auth user:', deleteError);
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
        console.error('❌ Invitation Accept (pending):', queueResult.code, queueResult.message);
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('❌ Invitation Accept: Failed to clean up auth user:', deleteError);
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
        console.error('❌ Invitation Accept: Auto sign-in failed:', pendingSignInError);
      }

      return NextResponse.json({
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          full_name: effectiveFullName,
          chapter_id: null,
          chapter: validation.chapter_name,
          role: 'active_member',
          member_status: 'active',
          needs_approval: true,
        },
      });
    }

    if (autoProfile) {
      // Generate username if needed
      const username = await generateUniqueUsername(supabase,
        effectiveFirstName,
        effectiveLastName,
        authData.user.id
      );
      const profileSlug = generateProfileSlug(username);

      // Profile auto-created by trigger, updating with all required fields
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({
          username: username,
          profile_slug: profileSlug,
          first_name: effectiveFirstName,
          last_name: effectiveLastName,
          full_name: effectiveFullName,
          chapter_id: invitation.chapter_id,
          chapter: validation.chapter_name,
          role: 'active_member',
          member_status: 'active',
          welcome_seen: false,
          phone: phoneDigits || null,
          sms_consent: body.sms_consent || false,
          grad_year: effectiveGradYear,
          major: majorString.trim() || null,
          location: location?.trim() || null,
          onboarding_completed: false, // Will be completed after onboarding
        })
        .eq('id', authData.user.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Invitation Accept: Profile update error:', updateError);
        
        // Clean up the auth user if profile update fails
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('❌ Invitation Accept: Failed to clean up auth user:', deleteError);
        }
        
        return NextResponse.json({ 
          error: 'Failed to update profile' 
        }, { status: 500 });
      }

      // Wait a moment and verify the update worked
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify the update worked
      const { data: verifiedProfile, error: verifyError } = await supabase
        .from('profiles')
        .select('id, chapter_id, chapter, role, member_status')
        .eq('id', authData.user.id)
        .single();
        
      if (verifyError) {
        console.error('❌ Invitation Accept: Error verifying profile update:', verifyError);
      }
    } else {
      // Generate username
      const username = await generateUniqueUsername(supabase,
        effectiveFirstName,
        effectiveLastName,
        authData.user.id
      );
      const profileSlug = generateProfileSlug(username);

      // No auto-profile found, creating manually with all required fields
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: normalizedEmail,
          full_name: effectiveFullName,
          first_name: effectiveFirstName,
          last_name: effectiveLastName,
          username: username,
          profile_slug: profileSlug,
          phone: phoneDigits || null,
          sms_consent: body.sms_consent || false,
          chapter_id: invitation.chapter_id,
          chapter: validation.chapter_name,
          role: 'active_member',
          member_status: 'active',
          grad_year: effectiveGradYear,
          major: majorString.trim() || null,
          location: location?.trim() || null,
          onboarding_completed: false, // Will be completed after onboarding
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (profileError) {
        console.error('❌ Invitation Accept: Profile creation error:', profileError);
        
        // Clean up the auth user if profile creation fails
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (deleteError) {
          console.error('❌ Invitation Accept: Failed to clean up auth user:', deleteError);
        }
        
        return NextResponse.json({ 
          error: 'Failed to create profile' 
        }, { status: 500 });
      }
    }

    // TRA-661: Create space_memberships row for the new user
    await upsertSpaceMembership(supabase, {
      userId: authData.user.id,
      spaceId: invitation.chapter_id,
      role: 'active_member',
      status: 'active',
      isPrimary: true,
    });

    // Record invitation usage
    const usageResult = await recordInvitationUsage(invitation.id, email, authData.user.id);
    if (!usageResult.success) {
      console.error('❌ Invitation Accept: Failed to record invitation usage:', usageResult.error);
    }

    // Sign in the user after account creation
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (signInError) {
      console.error('❌ Invitation Accept: Auto sign-in failed:', signInError);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        full_name,
        chapter_id: invitation.chapter_id,
        chapter: validation.chapter_name,
        role: 'active_member',
        member_status: 'active',
        needs_approval: false
      }
    });
  } catch (error) {
    console.error('❌ Invitation Accept: API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}