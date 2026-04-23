import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { generateInvitationUrl } from '@/lib/utils/invitationUtils';
import { EmailService } from '@/lib/services/emailService';

const MAX_RECIPIENTS = 20;

const BodySchema = z.object({
  token: z.string().min(1),
  recipients: z.array(z.string().email()).min(1).max(MAX_RECIPIENTS),
  personal_note: z.string().max(2000).optional(),
});

function guessFirstNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const cleaned = local.replace(/[._+0-9]/g, ' ').trim();
  const word = cleaned.split(/\s+/).filter(Boolean)[0] ?? local;
  if (!word) return 'there';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function inviterDisplayName(profile: {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  const full = profile.full_name?.trim();
  if (full) return full;
  const parts = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  if (parts) return parts;
  return 'A Trailblaize member';
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.SENDGRID_ALUMNI_PEER_INVITE_TEMPLATE_ID) {
      return NextResponse.json(
        { error: 'Email invitations are not configured. Please try again later.' },
        { status: 503 }
      );
    }

    const supabase = createServerSupabaseClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const bearer = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(bearer);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const json = await request.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { token: invitationToken, recipients, personal_note: personalNote } = parsed.data;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, role, full_name, first_name, last_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.chapter_id) {
      return NextResponse.json({ error: 'User not associated with a chapter' }, { status: 400 });
    }

    if (profile.role !== 'alumni' && profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only alumni can send alumni invitations through this endpoint' },
        { status: 403 }
      );
    }

    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select('*, chapters!inner(name)')
      .eq('token', invitationToken)
      .maybeSingle();

    if (inviteError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.created_by !== user.id) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.chapter_id !== profile.chapter_id) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.invitation_type !== 'alumni' || !invitation.is_active) {
      return NextResponse.json({ error: 'Invitation is no longer valid' }, { status: 400 });
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 400 });
    }

    if (
      invitation.max_uses !== null &&
      typeof invitation.usage_count === 'number' &&
      invitation.usage_count >= invitation.max_uses
    ) {
      return NextResponse.json({ error: 'This invitation has reached its use limit' }, { status: 400 });
    }

    const joinUrl = generateInvitationUrl(invitation.token, 'alumni');
    const chapterName =
      (invitation as { chapters?: { name?: string } }).chapters?.name ?? 'your chapter';
    const inviterName = inviterDisplayName(profile);

    const uniqueRecipients = Array.from(
      new Map(recipients.map((e) => [e.toLowerCase().trim(), e.trim()])).values()
    );

    const failed: { email: string; error: string }[] = [];
    let sent = 0;

    for (const to of uniqueRecipients) {
      const ok = await EmailService.sendAlumniPeerInviteEmail({
        to,
        recipientFirstName: guessFirstNameFromEmail(to),
        inviterName,
        chapterName,
        joinUrl,
        personalNote: personalNote?.trim() || undefined,
      });
      if (ok) {
        sent += 1;
      } else {
        failed.push({ email: to, error: 'Could not send to this address' });
      }
    }

    return NextResponse.json({
      sent,
      failed,
      total: uniqueRecipients.length,
    });
  } catch (error) {
    console.error('Alumni invite send-email API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
