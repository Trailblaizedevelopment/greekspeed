import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyModerationWebhook } from '@/lib/services/moderationWebhookService';

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getBearerUser(supabase: ReturnType<typeof createClient>, request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null as { id: string } | null, error: 'Authentication required' as const };
  }
  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { user: null, error: 'Invalid authentication' as const };
  }
  return { user, error: null };
}

/**
 * GET /api/user-blocks — list blocked user IDs for the current user.
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const { user, error } = await getBearerUser(supabase, request);
  if (error || !user) {
    return NextResponse.json({ error: error ?? 'Unauthorized' }, { status: 401 });
  }

  const { data, error: qError } = await supabase
    .from('user_blocks')
    .select('blocked_user_id')
    .eq('blocker_id', user.id);

  if (qError) {
    console.error('user_blocks list error:', qError);
    return NextResponse.json({ error: 'Failed to load blocks' }, { status: 500 });
  }

  const blockedUserIds = (data ?? []).map((r) => r.blocked_user_id as string);
  return NextResponse.json({ blockedUserIds });
}

/**
 * POST /api/user-blocks — block a user (same-chapter only).
 * Body: { blockedUserId: string }
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const { user, error } = await getBearerUser(supabase, request);
  if (error || !user) {
    return NextResponse.json({ error: error ?? 'Unauthorized' }, { status: 401 });
  }

  let body: { blockedUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const blockedUserId = typeof body.blockedUserId === 'string' ? body.blockedUserId.trim() : '';
  if (!blockedUserId) {
    return NextResponse.json({ error: 'blockedUserId is required' }, { status: 400 });
  }
  if (blockedUserId === user.id) {
    return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 });
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, chapter_id')
    .in('id', [user.id, blockedUserId]);

  if (profilesError || !profiles || profiles.length < 2) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const blocker = profiles.find((p) => p.id === user.id);
  const blocked = profiles.find((p) => p.id === blockedUserId);
  if (!blocker || !blocked) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (
    !blocker.chapter_id ||
    !blocked.chapter_id ||
    blocker.chapter_id !== blocked.chapter_id
  ) {
    return NextResponse.json(
      { error: 'You can only block members in the same chapter as you.' },
      { status: 403 },
    );
  }

  const { data: existing } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_user_id', blockedUserId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, alreadyBlocked: true });
  }

  const { error: insertError } = await supabase.from('user_blocks').insert({
    blocker_id: user.id,
    blocked_user_id: blockedUserId,
  });

  if (insertError) {
    console.error('user_blocks insert error:', insertError);
    return NextResponse.json({ error: 'Failed to block user' }, { status: 500 });
  }

  notifyModerationWebhook({
    event: 'user_block',
    blocker_id: user.id,
    blocked_user_id: blockedUserId,
    chapter_id: blocker.chapter_id,
  });

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/user-blocks?blockedUserId=uuid — unblock a user.
 */
export async function DELETE(request: NextRequest) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const { user, error } = await getBearerUser(supabase, request);
  if (error || !user) {
    return NextResponse.json({ error: error ?? 'Unauthorized' }, { status: 401 });
  }

  const blockedUserId = new URL(request.url).searchParams.get('blockedUserId')?.trim() ?? '';
  if (!blockedUserId) {
    return NextResponse.json({ error: 'blockedUserId query param is required' }, { status: 400 });
  }

  const { error: delError } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_user_id', blockedUserId);

  if (delError) {
    console.error('user_blocks delete error:', delError);
    return NextResponse.json({ error: 'Failed to unblock user' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
