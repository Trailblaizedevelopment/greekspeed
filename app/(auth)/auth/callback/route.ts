import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { generateUniqueUsername, generateProfileSlug } from '@/lib/utils/usernameUtils';
import { validateInvitationToken, recordInvitationUsage } from '@/lib/utils/invitationUtils';
import { cookies } from 'next/headers';
import { getSafeRedirect } from '@/lib/utils/safeRedirect';
import {
  OAUTH_POST_LOGIN_REDIRECT_COOKIE,
  OAUTH_SIGNUP_ROLE_COOKIE,
  resolvePostOAuthSafeRedirect,
  clearOauthPostLoginRedirectCookieOn,
  clearOauthSignupRoleCookieOn,
} from '@/lib/utils/oauthPostLoginRedirect';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Extract redirect parameter from hash or query (magic links use hash)
  const hashParams = requestUrl.hash ? new URLSearchParams(requestUrl.hash.substring(1)) : null;
  const redirectTo = hashParams?.get('redirect_to') || requestUrl.searchParams.get('redirect_to');

  // Extract invitation token and type from query params
  const invitationToken = requestUrl.searchParams.get('invitation_token');
  let invitationType = requestUrl.searchParams.get('invitation_type'); // 'active_member' or 'alumni'

  // Extract chapter join link params (reusable chapter link flow)
  const chapterSlug = requestUrl.searchParams.get('chapter_slug');
  const joinRole = requestUrl.searchParams.get('join_role'); // 'active_member' or 'alumni'

  console.log('OAuth callback received:', {
    hasCode: !!code,
    hasError: !!error,
    invitationToken,
    invitationType,
    chapterSlug,
    joinRole,
    requestUrl: requestUrl.toString(),
    origin: requestUrl.origin,
    allParams: Object.fromEntries(requestUrl.searchParams.entries())
  });

  // If no code and no error, this might be a redirect loop or hash fragment issue
  // LinkedIn OAuth sometimes redirects to /sign-in with hash fragments instead of /auth/callback with query params
  if (!code && !error) {
    console.warn('Callback hit without code or error - might be hash fragment redirect issue');
    console.warn('This can happen when OAuth provider redirects with hash fragments instead of query params');

    // If we have an invitation token, preserve it in the redirect
    if (invitationToken) {
      const redirectPath = invitationType === 'alumni'
        ? `/alumni-join/${invitationToken}`
        : `/join/${invitationToken}`;
      console.log('Preserving invitation token in redirect to:', redirectPath);
      return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
    }

    // If we have a chapter slug (reusable chapter join link), preserve it
    if (chapterSlug) {
      console.log('Preserving chapter slug in redirect to:', `/join/chapter/${chapterSlug}`);
      return NextResponse.redirect(`${requestUrl.origin}/join/chapter/${chapterSlug}`);
    }

    // Preserve return path (e.g. check-in) if Supabase echoed redirect_to but code is missing/misrouted
    const safeFallback = getSafeRedirect(redirectTo);
    if (safeFallback) {
      return NextResponse.redirect(
        `${requestUrl.origin}/sign-in?redirect=${encodeURIComponent(safeFallback)}`
      );
    }
    // Otherwise redirect to sign-in to let client-side handle hash fragments
    return NextResponse.redirect(`${requestUrl.origin}/sign-in`);
  }

  // Create response for cookie handling
  const cookieStore = await cookies();
  const signupRole =
    requestUrl.searchParams.get('signup_role') ||
    cookieStore.get(OAUTH_SIGNUP_ROLE_COOKIE)?.value ||
    null; // 'alumni' for public sign-up page (query or cookie)

  let response = NextResponse.next();

  // Create Supabase client with cookie handling (NOT service role)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.delete(name);
          response.cookies.set(name, '', { ...options, maxAge: 0 });
        },
      },
    }
  );

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription);
    // Redirect back to invitation page if token exists, otherwise to sign-in (NOT sign-up)
    if (invitationToken) {
      const redirectPath = invitationType === 'alumni'
        ? `/alumni-join/${invitationToken}`
        : `/join/${invitationToken}`;
      return NextResponse.redirect(
        `${requestUrl.origin}${redirectPath}?error=${encodeURIComponent(errorDescription || 'Authentication failed')}`
      );
    }
    if (chapterSlug) {
      return NextResponse.redirect(
        `${requestUrl.origin}/join/chapter/${chapterSlug}?error=${encodeURIComponent(errorDescription || 'Authentication failed')}`
      );
    }
    return NextResponse.redirect(
      `${requestUrl.origin}/sign-in?error=${encodeURIComponent(errorDescription || 'Authentication failed')}`
    );
  }

  // Handle successful OAuth callback
  if (code) {
    try {
      // Exchange code for session - this will set cookies automatically
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error('Session exchange error:', exchangeError);
        if (invitationToken) {
          const redirectPath = invitationType === 'alumni'
            ? `/alumni-join/${invitationToken}`
            : `/join/${invitationToken}`;
          return NextResponse.redirect(
            `${requestUrl.origin}${redirectPath}?error=${encodeURIComponent('Failed to complete authentication')}`
          );
        }
        if (chapterSlug) {
          return NextResponse.redirect(
            `${requestUrl.origin}/join/chapter/${chapterSlug}?error=${encodeURIComponent('Failed to complete authentication')}`
          );
        }
        return NextResponse.redirect(
          `${requestUrl.origin}/sign-in?error=${encodeURIComponent('Failed to complete authentication')}`
        );
      }

      // Use user from session data (more reliable than calling getUser again)
      const user = data?.session?.user || data?.user;

      if (!user) {
        console.error('No user found after session exchange. Session data:', JSON.stringify(data, null, 2));
        if (invitationToken) {
          const redirectPath = invitationType === 'alumni'
            ? `/alumni-join/${invitationToken}`
            : `/join/${invitationToken}`;
          return NextResponse.redirect(
            `${requestUrl.origin}${redirectPath}?error=${encodeURIComponent('User not found after authentication')}`
          );
        }
        if (chapterSlug) {
          return NextResponse.redirect(
            `${requestUrl.origin}/join/chapter/${chapterSlug}?error=${encodeURIComponent('User not found after authentication')}`
          );
        }
        return NextResponse.redirect(
          `${requestUrl.origin}/sign-in?error=${encodeURIComponent('User not found after authentication')}`
        );
      }

      console.log('OAuth callback - User authenticated:', {
        userId: user.id,
        email: user.email,
        provider: user.app_metadata?.provider,
        userMetadata: user.user_metadata,
        appMetadata: user.app_metadata
      });

      // Get service role client early for profile operations (avoids RLS issues)
      const { createServerSupabaseClient } = await import('@/lib/supabase/client');
      const serverSupabase = createServerSupabaseClient();

      // Check if profile already exists using server client (bypasses RLS)
      const { data: existingProfile, error: profileCheckError } = await serverSupabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileCheckError && profileCheckError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking for existing profile:', profileCheckError);
      }

      // Resolve OAuth avatar: copy LinkedIn/Google URLs to our storage so we control the asset (OAuth URLs can expire)
      let resolvedOAuthAvatarUrl: string | null = user.user_metadata?.picture || user.user_metadata?.avatar_url || null;
      const { isOAuthAvatarUrl, uploadAvatarFromUrl } = await import('@/lib/services/avatarFromUrlService');
      if (resolvedOAuthAvatarUrl && isOAuthAvatarUrl(resolvedOAuthAvatarUrl)) {
        const stored = await uploadAvatarFromUrl(resolvedOAuthAvatarUrl, user.id, serverSupabase);
        if (stored) resolvedOAuthAvatarUrl = stored;
      }

      // If invitation token exists, handle invitation flow
      if (invitationToken) {
        try {
          // Validate invitation token
          const validation = await validateInvitationToken(invitationToken);

          if (!validation.valid || !validation.invitation) {
            console.error('Invalid invitation token:', validation.error);
            // Fall through to create basic profile without invitation
            console.log('Falling back to basic profile creation without invitation');
          } else {
            const invitation = validation.invitation;

            // IMPORTANT: Use invitation.invitation_type if invitationType query param is missing
            // This ensures we get the correct type even if LinkedIn strips query params
            if (!invitationType && invitation.invitation_type) {
              invitationType = invitation.invitation_type;
              console.log('Recovered invitation_type from invitation object:', invitationType);
            }

            console.log('Invitation validation result:', {
              valid: validation.valid,
              hasInvitation: !!validation.invitation,
              invitationId: invitation.id,
              chapterId: invitation.chapter_id,
              chapterName: validation.chapter_name,
              invitationType: invitationType,
              invitationTypeFromInvitation: invitation.invitation_type
            });

            // Validate email domain if restricted
            const { validateEmailDomain, hasEmailUsedInvitation } = await import('@/lib/utils/invitationUtils');
            if (!validateEmailDomain(user.email || '', invitation.email_domain_allowlist)) {
              const redirectPath = invitationType === 'alumni'
                ? `/alumni-join/${invitationToken}`
                : `/join/${invitationToken}`;
              return NextResponse.redirect(
                `${requestUrl.origin}${redirectPath}?error=${encodeURIComponent('Email domain is not allowed for this invitation')}`
              );
            }

            // Check if this email has already used this invitation
            const hasUsed = await hasEmailUsedInvitation(invitation.id, user.email || '');
            if (hasUsed) {
              const redirectPath = invitationType === 'alumni'
                ? `/alumni-join/${invitationToken}`
                : `/join/${invitationToken}`;
              return NextResponse.redirect(
                `${requestUrl.origin}${redirectPath}?error=${encodeURIComponent('This email has already been used with this invitation')}`
              );
            }

            // Determine provider
            const provider = user.app_metadata?.provider || user.user_metadata?.provider || 'unknown';
            const isLinkedIn = provider === 'linkedin_oidc';
            const isGoogle = provider === 'google';

            // Extract names and OAuth data first (before using them)
            const firstName = user.user_metadata?.given_name || user.user_metadata?.first_name || '';
            const lastName = user.user_metadata?.family_name || user.user_metadata?.last_name || '';
            const fullName = user.user_metadata?.full_name || user.user_metadata?.name || `${firstName} ${lastName}`.trim() || 'OAuth User';

            // Determine default name based on provider
            let defaultName = 'OAuth User';
            if (isGoogle) {
              defaultName = 'Google User';
            } else if (isLinkedIn) {
              defaultName = 'LinkedIn User';
            }

            // Generate username (use server client for admin operations)
            const username = await generateUniqueUsername(serverSupabase, firstName, lastName, user.id);
            const profileSlug = generateProfileSlug(username);

            // Extract LinkedIn URL if available
            const linkedinSub = user.user_metadata?.sub;
            const linkedinUrl = isLinkedIn && linkedinSub
              ? `https://www.linkedin.com/in/${linkedinSub}`
              : null;

            // Use resolved OAuth avatar (may have been copied to our storage)
            const oauthAvatar = resolvedOAuthAvatarUrl;

            if (isLinkedIn || isGoogle) {
              const updateData: any = {};

              // Handle LinkedIn-specific updates
              if (isLinkedIn) {
                if (linkedinUrl && !existingProfile.linkedin_url) {
                  updateData.linkedin_url = linkedinUrl;
                }
              }

              // Handle avatar for both LinkedIn and Google
              if (oauthAvatar && !existingProfile.avatar_url) {
                updateData.avatar_url = oauthAvatar;
              }

              if (Object.keys(updateData).length > 0) {
                updateData.updated_at = new Date().toISOString();
                const { error: updateError } = await serverSupabase
                  .from('profiles')
                  .update(updateData)
                  .eq('id', user.id);

                if (updateError) {
                  console.error('Profile update error:', updateError);
                }
              }
            }

            // Determine role based on invitation type (use invitation.invitation_type as fallback)
            const role = (invitationType === 'alumni' || invitation.invitation_type === 'alumni')
              ? 'alumni'
              : 'active_member';
            const memberStatus = (invitationType === 'alumni' || invitation.invitation_type === 'alumni')
              ? 'alumni'
              : 'active';

            console.log('Setting profile with:', {
              role,
              memberStatus,
              chapterId: invitation.chapter_id,
              chapterName: validation.chapter_name,
              invitationTypeUsed: invitationType || invitation.invitation_type
            });

            if (!existingProfile) {
              console.log('About to create profile with:', {
                userId: user.id,
                email: user.email,
                fullName,
                firstName,
                lastName,
                chapterId: invitation.chapter_id,
                chapterName: validation.chapter_name,
                role,
                memberStatus
              });
              console.log('Creating profile for user:', user.id, 'with invitation:', invitation.id);
              // Create profile with invitation association using server client
              const { error: profileError } = await serverSupabase
                .from('profiles')
                .insert({
                  id: user.id,
                  email: user.email,
                  full_name: fullName,
                  first_name: firstName,
                  last_name: lastName,
                  username: username,
                  profile_slug: profileSlug,
                  linkedin_url: linkedinUrl,
                  avatar_url: oauthAvatar, // Use extracted OAuth avatar
                  chapter_id: invitation.chapter_id,
                  chapter: validation.chapter_name,
                  role: role,
                  member_status: memberStatus,
                  welcome_seen: false,
                  phone: null,
                  grad_year: null,
                  major: null,
                  location: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });

              if (profileError) {
                console.error('Profile creation error (with invitation):', profileError);
                console.error('Profile error details:', {
                  code: profileError.code,
                  message: profileError.message,
                  details: profileError.details,
                  hint: profileError.hint
                });
                // Don't redirect on error - try to create basic profile instead
                console.log('Attempting to create basic profile without invitation data');
              } else {
                console.log('Profile created successfully for user:', user.id);

                // If this is an alumni invitation, create alumni record
                if (role === 'alumni') {
                  try {
                    const nowIso = new Date().toISOString();

                    // Check if alumni record already exists
                    const { data: existingAlumni, error: fetchAlumniError } = await serverSupabase
                      .from('alumni')
                      .select('description, avatar_url, verified, is_actively_hiring, last_contact, tags, mutual_connections, created_at')
                      .eq('user_id', user.id)
                      .maybeSingle();

                    if (fetchAlumniError && fetchAlumniError.code !== 'PGRST116') {
                      console.error('Error checking for existing alumni record:', fetchAlumniError);
                    }

                    const alumniPayload = {
                      user_id: user.id,
                      first_name: firstName,
                      last_name: lastName,
                      full_name: fullName,
                      email: user.email || '',
                      chapter: validation.chapter_name,
                      chapter_id: invitation.chapter_id,
                      industry: 'Not specified',
                      graduation_year: new Date().getFullYear(),
                      company: 'Not specified',
                      job_title: 'Not specified',
                      phone: null,
                      location: 'Not specified',
                      linkedin_url: linkedinUrl,
                      description: existingAlumni?.description ?? `Alumni from ${validation.chapter_name}`,
                      avatar_url: existingAlumni?.avatar_url ?? resolvedOAuthAvatarUrl,
                      verified: existingAlumni?.verified ?? false,
                      is_actively_hiring: existingAlumni?.is_actively_hiring ?? false,
                      last_contact: existingAlumni?.last_contact ?? null,
                      tags: existingAlumni?.tags ?? null,
                      mutual_connections: existingAlumni?.mutual_connections ?? [],
                      created_at: existingAlumni?.created_at ?? nowIso,
                      updated_at: nowIso
                    };

                    const { error: alumniError } = await serverSupabase
                      .from('alumni')
                      .upsert(alumniPayload, { onConflict: 'user_id' });

                    if (alumniError) {
                      console.error('Alumni record creation error:', alumniError);
                      // Don't block the flow - profile is already created
                    } else {
                      console.log('Alumni record created successfully for user:', user.id);
                    }
                  } catch (alumniError) {
                    console.error('Alumni record creation exception:', alumniError);
                    // Don't block the flow - profile is already created
                  }
                }

                // Record invitation usage
                await recordInvitationUsage(invitation.id, user.email || '', user.id);

                // Redirect to onboarding for new users
                const redirectUrl = `${requestUrl.origin}/onboarding`;
                const htmlResponse = createHtmlRedirect(redirectUrl, response, cookieStore);
                return htmlResponse;
              }
            } else {
              console.log('Profile already exists for user:', user.id, 'updating with invitation data');
              // Profile exists - update with invitation data if not already associated
              if (!existingProfile.chapter_id && invitation.chapter_id) {
                const { error: updateError } = await serverSupabase
                  .from('profiles')
                  .update({
                    chapter_id: invitation.chapter_id,
                    chapter: validation.chapter_name,
                    role: role,
                    member_status: memberStatus,
                    linkedin_url: linkedinUrl || existingProfile.linkedin_url,
                    avatar_url: resolvedOAuthAvatarUrl ?? existingProfile.avatar_url,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', user.id);

                if (updateError) {
                  console.error('Profile update error:', updateError);
                }
              }

              // If this is an alumni invitation, create/update alumni record
              if (role === 'alumni') {
                try {
                  const nowIso = new Date().toISOString();

                  // Check if alumni record already exists
                  const { data: existingAlumni, error: fetchAlumniError } = await serverSupabase
                    .from('alumni')
                    .select('description, avatar_url, verified, is_actively_hiring, last_contact, tags, mutual_connections, created_at')
                    .eq('user_id', user.id)
                    .maybeSingle();

                  if (fetchAlumniError && fetchAlumniError.code !== 'PGRST116') {
                    console.error('Error checking for existing alumni record:', fetchAlumniError);
                  }

                  const alumniPayload = {
                    user_id: user.id,
                    first_name: firstName,
                    last_name: lastName,
                    full_name: fullName,
                    email: user.email || '',
                    chapter: validation.chapter_name,
                    chapter_id: invitation.chapter_id,
                    industry: 'Not specified',
                    graduation_year: new Date().getFullYear(),
                    company: 'Not specified',
                    job_title: 'Not specified',
                    phone: null,
                    location: 'Not specified',
                    linkedin_url: linkedinUrl || existingProfile.linkedin_url,
                    description: existingAlumni?.description ?? `Alumni from ${validation.chapter_name}`,
                    avatar_url: existingAlumni?.avatar_url ?? (resolvedOAuthAvatarUrl ?? existingProfile.avatar_url ?? null),
                    verified: existingAlumni?.verified ?? false,
                    is_actively_hiring: existingAlumni?.is_actively_hiring ?? false,
                    last_contact: existingAlumni?.last_contact ?? null,
                    tags: existingAlumni?.tags ?? null,
                    mutual_connections: existingAlumni?.mutual_connections ?? [],
                    created_at: existingAlumni?.created_at ?? nowIso,
                    updated_at: nowIso
                  };

                  const { error: alumniError } = await serverSupabase
                    .from('alumni')
                    .upsert(alumniPayload, { onConflict: 'user_id' });

                  if (alumniError) {
                    console.error('Alumni record upsert error:', alumniError);
                    // Don't block the flow - profile is already updated
                  } else {
                    console.log('Alumni record created/updated successfully for user:', user.id);
                  }
                } catch (alumniError) {
                  console.error('Alumni record upsert exception:', alumniError);
                  // Don't block the flow - profile is already updated
                }
              }

              // Record invitation usage
              await recordInvitationUsage(invitation.id, user.email || '', user.id);

              // Check if onboarding is completed
              const onboardingComplete = existingProfile.onboarding_completed === true;
              const redirectUrl = onboardingComplete
                ? `${requestUrl.origin}/dashboard`
                : `${requestUrl.origin}/onboarding`;
              const htmlResponse = createHtmlRedirect(redirectUrl, response, cookieStore);
              return htmlResponse;
            }
          }
        } catch (invitationError) {
          console.error('Invitation processing error:', invitationError);
          // Don't redirect - fall through to create basic profile
          console.log('Falling back to basic profile creation');
        }
      }

      // Handle chapter slug join link flow (reusable join link, no invitation token)
      if (chapterSlug && !invitationToken) {
        try {
          const { data: chapter, error: chapterError } = await serverSupabase
            .from('chapters')
            .select('id, name, slug, chapter_status')
            .eq('slug', chapterSlug)
            .eq('chapter_status', 'active')
            .single();

          if (chapterError || !chapter) {
            console.error('Chapter not found for slug:', chapterSlug);
          } else {
            const effectiveJoinRole = joinRole === 'alumni' ? 'alumni' : 'active_member';
            const role = effectiveJoinRole === 'alumni' ? 'alumni' : 'active_member';
            const memberStatus = effectiveJoinRole === 'alumni' ? 'alumni' : 'active';

            const chapterJoinProvider = user.app_metadata?.provider || user.user_metadata?.provider || 'unknown';
            const chapterJoinIsLinkedIn = chapterJoinProvider === 'linkedin_oidc';
            const firstName = user.user_metadata?.given_name || user.user_metadata?.first_name || '';
            const lastName = user.user_metadata?.family_name || user.user_metadata?.last_name || '';
            const fullName = user.user_metadata?.full_name || user.user_metadata?.name || `${firstName} ${lastName}`.trim() || 'OAuth User';
            const username = await generateUniqueUsername(serverSupabase, firstName, lastName, user.id);
            const profileSlug = generateProfileSlug(username);
            const linkedinSub = user.user_metadata?.sub;
            const linkedinUrl = chapterJoinIsLinkedIn && linkedinSub ? `https://www.linkedin.com/in/${linkedinSub}` : null;
            const oauthAvatar = resolvedOAuthAvatarUrl;

            console.log('Chapter join link OAuth - setting profile:', {
              role,
              memberStatus,
              chapterId: chapter.id,
              chapterName: chapter.name,
              joinRole: effectiveJoinRole,
            });

            if (!existingProfile) {
              const { error: profileError } = await serverSupabase
                .from('profiles')
                .insert({
                  id: user.id,
                  email: user.email,
                  full_name: fullName,
                  first_name: firstName,
                  last_name: lastName,
                  username,
                  profile_slug: profileSlug,
                  linkedin_url: linkedinUrl,
                  avatar_url: oauthAvatar,
                  chapter_id: chapter.id,
                  chapter: chapter.name,
                  role,
                  member_status: memberStatus,
                  welcome_seen: false,
                  phone: null,
                  grad_year: null,
                  major: null,
                  location: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });

              if (profileError) {
                console.error('Chapter join link: Profile creation error:', profileError);
              } else {
                if (role === 'alumni') {
                  try {
                    const nowIso = new Date().toISOString();
                    await serverSupabase.from('alumni').upsert({
                      user_id: user.id,
                      first_name: firstName,
                      last_name: lastName,
                      full_name: fullName,
                      email: user.email || '',
                      chapter: chapter.name,
                      chapter_id: chapter.id,
                      industry: 'Not specified',
                      graduation_year: new Date().getFullYear(),
                      company: 'Not specified',
                      job_title: 'Not specified',
                      phone: null,
                      location: 'Not specified',
                      linkedin_url: linkedinUrl,
                      description: `Alumni from ${chapter.name}`,
                      avatar_url: oauthAvatar,
                      verified: false,
                      is_actively_hiring: false,
                      last_contact: null,
                      tags: null,
                      mutual_connections: [],
                      created_at: nowIso,
                      updated_at: nowIso,
                    }, { onConflict: 'user_id' });
                  } catch (alumniError) {
                    console.error('Chapter join link: Alumni record error:', alumniError);
                  }
                }

                const redirectUrl = `${requestUrl.origin}/onboarding`;
                return createHtmlRedirect(redirectUrl, response, cookieStore);
              }
            } else {
              if (!existingProfile.chapter_id && chapter.id) {
                await serverSupabase
                  .from('profiles')
                  .update({
                    chapter_id: chapter.id,
                    chapter: chapter.name,
                    role,
                    member_status: memberStatus,
                    linkedin_url: linkedinUrl || existingProfile.linkedin_url,
                    avatar_url: resolvedOAuthAvatarUrl ?? existingProfile.avatar_url,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', user.id);
              }

              if (role === 'alumni') {
                try {
                  const nowIso = new Date().toISOString();
                  const { data: existingAlumni } = await serverSupabase
                    .from('alumni')
                    .select('description, avatar_url, verified, is_actively_hiring, last_contact, tags, mutual_connections, created_at')
                    .eq('user_id', user.id)
                    .maybeSingle();

                  await serverSupabase.from('alumni').upsert({
                    user_id: user.id,
                    first_name: firstName,
                    last_name: lastName,
                    full_name: fullName,
                    email: user.email || '',
                    chapter: chapter.name,
                    chapter_id: chapter.id,
                    industry: 'Not specified',
                    graduation_year: new Date().getFullYear(),
                    company: 'Not specified',
                    job_title: 'Not specified',
                    phone: null,
                    location: 'Not specified',
                    linkedin_url: linkedinUrl || existingProfile.linkedin_url,
                    description: existingAlumni?.description ?? `Alumni from ${chapter.name}`,
                    avatar_url: existingAlumni?.avatar_url ?? (resolvedOAuthAvatarUrl ?? existingProfile.avatar_url ?? null),
                    verified: existingAlumni?.verified ?? false,
                    is_actively_hiring: existingAlumni?.is_actively_hiring ?? false,
                    last_contact: existingAlumni?.last_contact ?? null,
                    tags: existingAlumni?.tags ?? null,
                    mutual_connections: existingAlumni?.mutual_connections ?? [],
                    created_at: existingAlumni?.created_at ?? nowIso,
                    updated_at: nowIso,
                  }, { onConflict: 'user_id' });
                } catch (alumniError) {
                  console.error('Chapter join link: Alumni record upsert error:', alumniError);
                }
              }

              const onboardingComplete = existingProfile.onboarding_completed === true;
              const redirectUrl = onboardingComplete
                ? `${requestUrl.origin}/dashboard`
                : `${requestUrl.origin}/onboarding`;
              return createHtmlRedirect(redirectUrl, response, cookieStore);
            }
          }
        } catch (chapterJoinError) {
          console.error('Chapter join link processing error:', chapterJoinError);
          console.log('Falling back to basic profile creation');
        }
      }

      // ALWAYS ensure profile exists (fallback for missing invitation token or errors)
      const isPublicAlumniSignup = signupRole === 'alumni';

      if (!existingProfile) {
        console.log('Creating basic profile for user (no invitation or fallback):', user.id);

        // Determine provider
        const provider = user.app_metadata?.provider || user.user_metadata?.provider || 'unknown';
        const isLinkedIn = provider === 'linkedin_oidc';
        const isGoogle = provider === 'google';

        // Extract LinkedIn URL if available
        const linkedinSub = user.user_metadata?.sub;
        const linkedinUrl = isLinkedIn && linkedinSub
          ? `https://www.linkedin.com/in/${linkedinSub}`
          : null;

        // Determine default name based on provider
        let defaultName = 'OAuth User';
        if (isGoogle) {
          defaultName = 'Google User';
        } else if (isLinkedIn) {
          defaultName = 'LinkedIn User';
        }

        // Extract first and last name for username generation
        const firstName = user.user_metadata?.given_name || user.user_metadata?.first_name || '';
        const lastName = user.user_metadata?.family_name || user.user_metadata?.last_name || '';
        const fullName = user.user_metadata?.full_name || user.user_metadata?.name || defaultName;

        // Generate username for OAuth user
        const username = await generateUniqueUsername(serverSupabase, firstName, lastName, user.id);
        const profileSlug = generateProfileSlug(username);

        // Create profile for new OAuth user
        const { error: profileError } = await serverSupabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: fullName,
            first_name: firstName,
            last_name: lastName,
            username: username,
            profile_slug: profileSlug,
            linkedin_url: linkedinUrl,
            avatar_url: resolvedOAuthAvatarUrl,
            chapter: null,
            role: isPublicAlumniSignup ? 'alumni' : null,
            member_status: isPublicAlumniSignup ? 'alumni' : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (profileError) {
          console.error('Profile creation error (fallback):', profileError);
          console.error('Profile error details:', {
            code: profileError.code,
            message: profileError.message,
            details: profileError.details,
            hint: profileError.hint
          });
          return NextResponse.redirect(
            `${requestUrl.origin}/sign-in?error=${encodeURIComponent('Profile creation failed. Please contact support.')}`
          );
        }
        console.log('Basic profile created successfully for user:', user.id);

        if (isPublicAlumniSignup) {
          try {
            const nowIso = new Date().toISOString();
            const { error: alumniError } = await serverSupabase
              .from('alumni')
              .upsert({
                user_id: user.id,
                first_name: firstName,
                last_name: lastName,
                full_name: fullName,
                email: user.email || '',
                chapter: null,
                chapter_id: null,
                industry: 'Not specified',
                graduation_year: new Date().getFullYear(),
                company: 'Not specified',
                job_title: 'Not specified',
                phone: null,
                location: 'Not specified',
                linkedin_url: linkedinUrl,
                description: 'Alumni',
                avatar_url: resolvedOAuthAvatarUrl,
                verified: false,
                is_actively_hiring: false,
                last_contact: null,
                tags: null,
                mutual_connections: [],
                created_at: nowIso,
                updated_at: nowIso
              }, { onConflict: 'user_id' });

            if (alumniError) {
              console.error('Alumni record creation error (public signup):', alumniError);
            } else {
              console.log('Alumni record created for public OAuth signup:', user.id);
            }
          } catch (alumniError) {
            console.error('Alumni record creation exception (public signup):', alumniError);
          }
        }
      } else {
        // Update existing profile with OAuth data if available
        const provider = user.app_metadata?.provider || user.user_metadata?.provider || 'unknown';
        const isLinkedIn = provider === 'linkedin_oidc';
        const isGoogle = provider === 'google';

        if (isLinkedIn || isGoogle) {
          const updateData: any = {};

          // Handle LinkedIn-specific updates
          if (isLinkedIn) {
            const linkedinSub = user.user_metadata?.sub;
            const linkedinUrl = linkedinSub
              ? `https://www.linkedin.com/in/${linkedinSub}`
              : null;

            if (linkedinUrl && !existingProfile.linkedin_url) {
              updateData.linkedin_url = linkedinUrl;
            }
          }

          // Handle avatar for both LinkedIn and Google (use resolved URL, may be in our storage)
          if (resolvedOAuthAvatarUrl && !existingProfile.avatar_url) {
            updateData.avatar_url = resolvedOAuthAvatarUrl;
          }

          // Auto-assign alumni role for public sign-up page OAuth if not already set
          if (isPublicAlumniSignup && !existingProfile.role) {
            updateData.role = 'alumni';
            updateData.member_status = 'alumni';
          }

          if (Object.keys(updateData).length > 0) {
            updateData.updated_at = new Date().toISOString();
            const { error: updateError } = await serverSupabase
              .from('profiles')
              .update(updateData)
              .eq('id', user.id);

            if (updateError) {
              console.error('Profile update error:', updateError);
            }
          }
        }
      }

      // Check if profile is incomplete or onboarding not done
      const finalProfileCheck = await serverSupabase
        .from('profiles')
        .select('chapter, role, onboarding_completed')
        .eq('id', user.id)
        .single();

      const profile = finalProfileCheck.data;
      const isIncomplete = !profile?.chapter || !profile?.role;
      const onboardingComplete = profile?.onboarding_completed === true;

      const oauthPostLoginRedirectCookie = cookieStore.get(
        OAUTH_POST_LOGIN_REDIRECT_COOKIE
      )?.value;

      // Redirect based on profile/onboarding completeness
      if (isIncomplete || !onboardingComplete) {
        const onboardingRes = NextResponse.redirect(
          `${requestUrl.origin}/onboarding`
        );
        clearOauthSignupRoleCookieOn(onboardingRes);
        return onboardingRes;
      } else {
        // Query `redirect_to` (Supabase) or cookie set on sign-in before OAuth
        const safePath = resolvePostOAuthSafeRedirect(
          redirectTo,
          oauthPostLoginRedirectCookie
        );
        const finalRedirect = safePath
          ? `${requestUrl.origin}${safePath}`
          : `${requestUrl.origin}/dashboard`;
        const redirectRes = NextResponse.redirect(finalRedirect);
        clearOauthPostLoginRedirectCookieOn(redirectRes);
        clearOauthSignupRoleCookieOn(redirectRes);
        return redirectRes;
      }
    } catch (error) {
      console.error('Callback processing error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      if (invitationToken) {
        const redirectPath = invitationType === 'alumni'
          ? `/alumni-join/${invitationToken}`
          : `/join/${invitationToken}`;
        return NextResponse.redirect(
          `${requestUrl.origin}${redirectPath}?error=${encodeURIComponent('Authentication processing failed')}`
        );
      }
      if (chapterSlug) {
        return NextResponse.redirect(
          `${requestUrl.origin}/join/chapter/${chapterSlug}?error=${encodeURIComponent('Authentication processing failed')}`
        );
      }
      return NextResponse.redirect(
        `${requestUrl.origin}/sign-in?error=${encodeURIComponent('Authentication processing failed')}`
      );
    }
  }

  // Fallback redirect - NEVER redirect to sign-up (marketing page)
  if (invitationToken) {
    const redirectPath = invitationType === 'alumni'
      ? `/alumni-join/${invitationToken}`
      : `/join/${invitationToken}`;
    return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
  }
  if (chapterSlug) {
    return NextResponse.redirect(`${requestUrl.origin}/join/chapter/${chapterSlug}`);
  }
  // Redirect to sign-in instead of sign-up to avoid marketing page
  return NextResponse.redirect(`${requestUrl.origin}/sign-in`);
}

// Helper function for HTML redirect with cookies
function createHtmlRedirect(redirectUrl: string, response: NextResponse, cookieStore: any) {
  const htmlResponse = new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="refresh" content="0;url=${redirectUrl}">
        <script>window.location.href="${redirectUrl}";</script>
      </head>
      <body>
        <p>Redirecting... <a href="${redirectUrl}">Click here if not redirected</a></p>
      </body>
    </html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    }
  );

  // Copy all cookies from the response to the HTML response
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      htmlResponse.headers.append(key, value);
    }
  });

  // Also copy cookies from response.cookies
  response.cookies.getAll().forEach((cookie) => {
    htmlResponse.cookies.set(cookie.name, cookie.value, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  });

  return htmlResponse;
} 