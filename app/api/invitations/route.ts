import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { generateInvitationToken, generateInvitationUrl } from '@/lib/utils/invitationUtils';
import { CreateInvitationData } from '@/types/invitations';
import { canManageChapterForContext } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');

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

    const targetChapterId = chapterId || profile.chapter_id;
    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    if (!canManageChapterForContext(profile, targetChapterId, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Fetch invitations with usage data
    const { data: invitations, error } = await supabase
      .from('invitations')
      .select(`
        *,
        usage:invitation_usage(
          id,
          email,
          user_id,
          used_at,
          profiles!invitation_usage_user_id_fkey(
            id,
            full_name,
            first_name,
            last_name
          )
        ),
        spaces!inner(name),
        creator:profiles!invitations_created_by_fkey(
          id,
          full_name,
          first_name,
          last_name
        )
      `)
      .eq('chapter_id', targetChapterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Invitations fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 });
    }

    // Transform the data to include URLs and formatted usage
    const transformedInvitations = invitations?.map(invitation => ({
      ...invitation,
      invitation_url: generateInvitationUrl(invitation.token),
      chapter_name: invitation.spaces?.name,
      created_by_name: invitation.creator?.full_name || `${invitation.creator?.first_name} ${invitation.creator?.last_name}`.trim(),
      usage: invitation.usage?.map((usage: any) => ({
        ...usage,
        user_name: usage.profiles?.full_name || `${usage.profiles?.first_name} ${usage.profiles?.last_name}`.trim() || usage.email
      })) || []
    })) || [];

    return NextResponse.json({ invitations: transformedInvitations });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body: CreateInvitationData = await request.json();
    const { chapter_id, email_domain_allowlist, approval_mode, single_use, expires_at, max_uses } = body;

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
      .select('chapter_id, role, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.chapter_id) {
      return NextResponse.json({ error: 'User not associated with a chapter' }, { status: 400 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    if (!canManageChapterForContext(profile, chapter_id, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Generate unique token
    let invitationToken = generateInvitationToken();
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure token is unique
    while (!isUnique && attempts < maxAttempts) {
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

    // Create invitation
    const { data: invitation, error: createError } = await supabase
      .from('invitations')
      .insert({
        token: invitationToken,
        chapter_id,
        created_by: user.id,
        email_domain_allowlist: email_domain_allowlist || null,
        approval_mode: approval_mode || 'auto',
        single_use: single_use || false,
        expires_at: expires_at || null,
        max_uses: max_uses || null,
        invitation_type: body.invitation_type || 'active_member',
        is_active: true
      })
      .select(`
        *,
        spaces!inner(name),
        creator:profiles!invitations_created_by_fkey(
          id,
          full_name,
          first_name,
          last_name
        )
      `)
      .single();

    if (createError) {
      console.error('Invitation creation error:', createError);
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
    }

    // Transform the data
    const transformedInvitation = {
      ...invitation,
      invitation_url: generateInvitationUrl(invitation.token, invitation.invitation_type),
      chapter_name: invitation.spaces?.name,
      created_by_name: invitation.creator?.full_name || `${invitation.creator?.first_name} ${invitation.creator?.last_name}`.trim(),
      usage: []
    };

    return NextResponse.json({ invitation: transformedInvitation });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

