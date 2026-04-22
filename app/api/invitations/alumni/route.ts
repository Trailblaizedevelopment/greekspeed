import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { generateInvitationToken, generateInvitationUrl } from '@/lib/utils/invitationUtils';

const MAX_ALUMNI_INVITES_PER_DAY = 3;

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

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
      .select('chapter_id, role, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.chapter_id) {
      return NextResponse.json({ error: 'User not associated with a chapter' }, { status: 400 });
    }

    if (profile.role !== 'alumni' && profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only alumni can create alumni invitations through this endpoint' },
        { status: 403 }
      );
    }

    const chapterId = profile.chapter_id;

    // Rate-limit: count invitations created by this user in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('invitations')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .eq('invitation_type', 'alumni')
      .gte('created_at', oneDayAgo);

    if ((recentCount ?? 0) >= MAX_ALUMNI_INVITES_PER_DAY) {
      // Instead of blocking, try to reuse an existing active invitation
      const { data: existing } = await supabase
        .from('invitations')
        .select('*, chapters!inner(name)')
        .eq('chapter_id', chapterId)
        .eq('created_by', user.id)
        .eq('invitation_type', 'alumni')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({
          invitation: {
            ...existing,
            invitation_url: generateInvitationUrl(existing.token, 'alumni'),
            chapter_name: existing.chapters?.name,
          },
          reused: true,
        });
      }

      return NextResponse.json(
        { error: 'You have reached the daily limit for creating alumni invitations. Please try again later.' },
        { status: 429 }
      );
    }

    // Try to reuse an active alumni invitation created by this user for this chapter
    const { data: existingInvite } = await supabase
      .from('invitations')
      .select('*, chapters!inner(name)')
      .eq('chapter_id', chapterId)
      .eq('created_by', user.id)
      .eq('invitation_type', 'alumni')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInvite) {
      const isExpired = existingInvite.expires_at && new Date(existingInvite.expires_at) < new Date();
      const isAtLimit = existingInvite.max_uses !== null && existingInvite.usage_count >= existingInvite.max_uses;

      if (!isExpired && !isAtLimit) {
        return NextResponse.json({
          invitation: {
            ...existingInvite,
            invitation_url: generateInvitationUrl(existingInvite.token, 'alumni'),
            chapter_name: existingInvite.chapters?.name,
          },
          reused: true,
        });
      }
    }

    // Generate a unique token
    let invitationToken = generateInvitationToken();
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      const { data: existing } = await supabase
        .from('invitations')
        .select('id')
        .eq('token', invitationToken)
        .single();

      if (!existing) {
        isUnique = true;
      } else {
        invitationToken = generateInvitationToken();
        attempts++;
      }
    }

    if (!isUnique) {
      return NextResponse.json({ error: 'Failed to generate unique invitation token' }, { status: 500 });
    }

    // Create a new alumni invitation with sensible defaults
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    const { data: invitation, error: createError } = await supabase
      .from('invitations')
      .insert({
        token: invitationToken,
        chapter_id: chapterId,
        created_by: user.id,
        email_domain_allowlist: null,
        approval_mode: 'auto',
        single_use: false,
        expires_at: expiresAt,
        max_uses: 25,
        invitation_type: 'alumni',
        is_active: true,
      })
      .select('*, chapters!inner(name)')
      .single();

    if (createError) {
      console.error('Alumni invitation creation error:', createError);
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
    }

    return NextResponse.json({
      invitation: {
        ...invitation,
        invitation_url: generateInvitationUrl(invitation.token, 'alumni'),
        chapter_name: invitation.chapters?.name,
      },
      reused: false,
    });
  } catch (error) {
    console.error('Alumni invitation API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
