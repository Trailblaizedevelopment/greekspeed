import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { generateInvitationUrl } from '@/lib/utils/invitationUtils';
import { canManageChapterForContext } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { email_domain_allowlist, approval_mode, single_use, expires_at, max_uses, is_active } = body;
    
    // Await params before accessing its properties
    const { id } = await params;

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

    const { data: existingInvitation, error: fetchError } = await supabase
      .from('invitations')
      .select('chapter_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingInvitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    if (!canManageChapterForContext(profile, existingInvitation.chapter_id, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Update invitation
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (email_domain_allowlist !== undefined) updateData.email_domain_allowlist = email_domain_allowlist;
    if (approval_mode !== undefined) updateData.approval_mode = approval_mode;
    if (single_use !== undefined) updateData.single_use = single_use;
    if (expires_at !== undefined) updateData.expires_at = expires_at;
    if (max_uses !== undefined) updateData.max_uses = max_uses;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: invitation, error: updateError } = await supabase
      .from('invitations')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        spaces!inner(name),
        creator:profiles!invitations_created_by_fkey(
          id,
          full_name,
          first_name,
          last_name
        ),
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
        )
      `)
      .single();

    if (updateError) {
      console.error('Invitation update error:', updateError);
      return NextResponse.json({ error: 'Failed to update invitation' }, { status: 500 });
    }

    // Transform the data
    const transformedInvitation = {
      ...invitation,
      invitation_url: generateInvitationUrl(invitation.token, invitation.invitation_type),
      chapter_name: invitation.spaces?.name,
      created_by_name: invitation.creator?.full_name || `${invitation.creator?.first_name} ${invitation.creator?.last_name}`.trim(),
      usage: invitation.usage?.map((usage: any) => ({
        ...usage,
        user_name: usage.profiles?.full_name || `${usage.profiles?.first_name} ${usage.profiles?.last_name}`.trim() || usage.email
      })) || []
    };

    return NextResponse.json({ invitation: transformedInvitation });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerSupabaseClient();
    
    // Await params before accessing its properties
    const { id } = await params;

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

    const { data: existingInvitation, error: fetchError } = await supabase
      .from('invitations')
      .select('chapter_id')
      .eq('id', id)
      .single();

    if (fetchError || !existingInvitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    if (!canManageChapterForContext(profile, existingInvitation.chapter_id, managedChapterIds)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Delete invitation (this will cascade delete invitation_usage records)
    const { error: deleteError } = await supabase
      .from('invitations')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Invitation deletion error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete invitation' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

