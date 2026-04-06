import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertAuthenticatedChapterReadAccess } from '@/lib/api/chapterScopedAccess';
import { parseMentions, resolveMentions } from '@/lib/utils/mentionUtils';
import { sendMentionNotifications } from '@/lib/services/mentionNotificationService';

/**
 * GET /api/posts/[id]
 * Returns a single post with author, is_liked, is_author. Used for post-detail page.
 * Enforces auth and chapter access (same pattern as feed).
 */
export async function GET(
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, is_developer, signup_channel')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select(`
        id,
        chapter_id,
        author_id,
        content,
        post_type,
        image_url,
        metadata,
        likes_count,
        comments_count,
        shares_count,
        created_at,
        updated_at,
        author:profiles!author_id(
          id,
          full_name,
          first_name,
          last_name,
          avatar_url,
          chapter_role,
          member_status
        )
      `)
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const access = await assertAuthenticatedChapterReadAccess(
      supabase,
      user.id,
      {
        chapter_id: profile.chapter_id,
        signup_channel: profile.signup_channel,
        is_developer: profile.is_developer,
      },
      post.chapter_id as string
    );
    if (!access.ok) {
      return access.response;
    }

    const [userLikeResult, userBookmarkResult] = await Promise.all([
      supabase
        .from('post_likes')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('post_bookmarks')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const author = Array.isArray(post.author) ? post.author[0] ?? null : post.author ?? null;
    const response = {
      ...post,
      author,
      is_liked: !!userLikeResult.data,
      is_bookmarked: !!userBookmarkResult.data,
      is_author: post.author_id === user.id,
      likes_count: post.likes_count ?? 0,
      comments_count: post.comments_count ?? 0,
      shares_count: post.shares_count ?? 0,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Post GET API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    // Check if post exists and get its details
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('author_id, chapter_id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Check if user is the author of the post
    if (post.author_id !== user.id) {
      return NextResponse.json({ error: 'You can only delete your own posts' }, { status: 403 });
    }

    // Delete the post
    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (deleteError) {
      console.error('Post deletion error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/posts/[id]
 * Update post body text only (author only). Does not accept client metadata — avoids wiping image_urls etc.
 */
export async function PATCH(
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
    const { content } = body;

    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content (string) is required' }, { status: 400 });
    }

    const trimmed = content.trim();

    const { data: existing, error: postError } = await supabase
      .from('posts')
      .select('id, author_id, chapter_id, post_type')
      .eq('id', postId)
      .single();

    if (postError || !existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (existing.author_id !== user.id) {
      return NextResponse.json({ error: 'You can only edit your own posts' }, { status: 403 });
    }

    if (existing.post_type === 'text' && !trimmed) {
      return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 });
    }

    // Recalculate mentions for the updated content
    const mentionUsernames = parseMentions(trimmed);
    const resolvedMentions = mentionUsernames.length > 0
      ? await resolveMentions(supabase, mentionUsernames, existing.chapter_id)
      : [];

    // Read current metadata to preserve link_previews / image_urls / etc.
    const { data: fullPost } = await supabase
      .from('posts')
      .select('metadata')
      .eq('id', postId)
      .single();

    const currentMetadata = (fullPost?.metadata as Record<string, unknown>) ?? {};
    const previousMentions: Array<{ user_id: string }> = (currentMetadata.mentions as Array<{ user_id: string }>) ?? [];
    const previousMentionIds = new Set(previousMentions.map((m) => m.user_id));

    const updatedMetadata = {
      ...currentMetadata,
      mentions: resolvedMentions.length > 0 ? resolvedMentions : undefined,
    };
    if (!resolvedMentions.length) {
      delete updatedMetadata.mentions;
    }

    const { data: updated, error: updateError } = await supabase
      .from('posts')
      .update({
        content: trimmed,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .select()
      .single();

    if (updateError) {
      console.error('Post PATCH error:', updateError);
      return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
    }

    // Notify only newly-added mentions (not previously mentioned users)
    const newMentions = resolvedMentions.filter((m) => !previousMentionIds.has(m.user_id));
    if (newMentions.length > 0) {
      sendMentionNotifications({
        mentionedUsers: newMentions,
        actorUserId: user.id,
        contentType: 'post',
        contentId: postId,
        postId: postId,
        contentPreview: trimmed.slice(0, 80),
        supabase,
      }).catch((err) => console.error('Failed to send edit mention notifications:', err));
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Post PATCH API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
