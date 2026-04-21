import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyModerationWebhook } from '@/lib/services/moderationWebhookService';

/**
 * POST /api/posts/[id]/report
 * Report a post. Requires post_reports table (see docs/MANUAL_SETUP.md or migration).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, chapter_id, author_id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('chapter_id, is_developer')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const canAccess = profile.is_developer === true || profile.chapter_id === post.chapter_id;
    if (!canAccess) {
      return NextResponse.json({ error: 'Cannot report posts from other chapters' }, { status: 403 });
    }

    const { error: insertError } = await supabase.from('post_reports').insert({
      post_id: postId,
      reporter_id: user.id,
      reason: reason || null,
    });

    if (insertError) {
      console.error('Post report insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to submit report. Ensure post_reports table exists.' },
        { status: 500 }
      );
    }

    notifyModerationWebhook({
      event: 'post_report',
      post_id: postId,
      chapter_id: post.chapter_id,
      reporter_id: user.id,
      author_id: post.author_id,
      reason: reason || undefined,
    });

    return NextResponse.json({ success: true, message: 'Report submitted' });
  } catch (error) {
    console.error('Report post API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
