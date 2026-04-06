import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertAuthenticatedChapterReadAccess } from '@/lib/api/chapterScopedAccess';
import { fetchLinkPreviewsServer } from '@/lib/services/linkPreviewService';
import { LinkPreview } from '@/types/posts';
import { buildPushPayload } from '@/lib/services/notificationPushPayload';
import { sendPushToUser } from '@/lib/services/oneSignalPushService';
import { canSendEmailNotification } from '@/lib/utils/checkEmailPreferences';
import { EmailService } from '@/lib/services/emailService';
import { parseMentions, resolveMentions } from '@/lib/utils/mentionUtils';
import { sendMentionNotifications } from '@/lib/services/mentionNotificationService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { id: postId } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

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

    // Check if post exists and user has access to it
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('chapter_id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, is_developer, signup_channel')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
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

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Fetch comments with author information and like status
    const { data: comments, error } = await supabase
      .from('post_comments')
      .select(`
        *,
        author:profiles!author_id(
          id,
          full_name,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Comments fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    // Check which comments the current user has liked
    if (comments && comments.length > 0) {
      const commentIds = comments.map(comment => comment.id);
      const { data: userLikes, error: likesError } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', commentIds);

      if (!likesError && userLikes) {
        const likedCommentIds = new Set(userLikes.map(like => like.comment_id));
        comments.forEach(comment => {
          comment.is_liked = likedCommentIds.has(comment.id);
        });
      }
    }

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('post_comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    return NextResponse.json({
      comments: comments || [],
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit)
      }
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { id: postId } = await params;
    const body = await request.json();
    const { content, parent_comment_id } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
    }

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

    // Check if post exists and user has access to it (include author_id for push)
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('chapter_id, author_id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, is_developer, signup_channel')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
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

    let parentCommentAuthorId: string | null = null;
    if (parent_comment_id) {
      const { data: parentComment, error: parentError } = await supabase
        .from('post_comments')
        .select('id, post_id, parent_comment_id, author_id')
        .eq('id', parent_comment_id)
        .single();

      if (parentError || !parentComment) {
        return NextResponse.json(
          { error: 'Parent comment not found' },
          { status: 404 }
        );
      }

      if (parentComment.post_id !== postId) {
        return NextResponse.json(
          { error: 'Parent comment does not belong to this post' },
          { status: 400 }
        );
      }

      // Prevent replying to replies - only allow replying to top-level comments
      if (parentComment.parent_comment_id) {
        return NextResponse.json(
          { error: 'You can only reply to top-level comments, not replies' },
          { status: 400 }
        );
      }
      parentCommentAuthorId = parentComment.author_id;
    }

    // Extract URLs and fetch link previews (don't block comment creation if this fails)
    let linkPreviews: LinkPreview[] = [];
    if (content) {
      try {
        // Log the content to see what we're processing
        console.log('[Comment API] Processing content for link previews:', content);
        
        const previewResults = await fetchLinkPreviewsServer(content);
        
        // Log what we got back
        console.log('[Comment API] Preview results:', {
          totalResults: previewResults.length,
          results: previewResults.map(r => ({
            url: r.url,
            hasPreview: !!r.preview,
            error: r.error
          }))
        });
        
        linkPreviews = previewResults
          .filter(result => result.preview)
          .map(result => result.preview!);
        
        // Log final link previews
        console.log('[Comment API] Final link previews:', linkPreviews.length);
        
        if (previewResults.length > 0 && linkPreviews.length === 0) {
          console.warn('[Comment API] URLs found but no valid previews returned. Results:', 
            previewResults.map(r => ({ url: r.url, error: r.error }))
          );
        }
      } catch (error) {
        console.error('[Comment API] Error fetching link previews:', error);
        // Continue without previews - don't block comment creation
      }
    }

    // Resolve @mentions server-side
    const mentionUsernames = parseMentions(content);
    const resolvedMentions = mentionUsernames.length > 0
      ? await resolveMentions(supabase, mentionUsernames, post.chapter_id)
      : [];

    // Build metadata with link previews and mentions
    const finalMetadata = (linkPreviews.length > 0 || resolvedMentions.length > 0)
    ? {
        ...(linkPreviews.length > 0 ? { link_previews: linkPreviews } : {}),
        ...(resolvedMentions.length > 0 ? { mentions: resolvedMentions } : {}),
      }
    : undefined;

    // Create comment
    const { data: comment, error: createError } = await supabase
    .from('post_comments')
    .insert({
      post_id: postId,
      author_id: user.id,
      content: content.trim(),
      parent_comment_id: parent_comment_id || null,
      // Use undefined instead of null - Supabase will handle this correctly
      // Only set metadata if we have link_previews, otherwise omit the field
      ...(finalMetadata ? { metadata: finalMetadata } : {})
    })
      .select(`
        *,
        author:profiles!author_id(
          id,
          full_name,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .single();

    if (createError) {
      console.error('Comment creation error:', createError);
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    const authorProfile = Array.isArray(comment?.author) ? comment?.author?.[0] : comment?.author;
    const contentPreview = content.trim().slice(0, 80);
    const eventType = parent_comment_id ? 'comment_reply' : 'post_comment';
    const notifyUserId = parent_comment_id ? parentCommentAuthorId : post.author_id;
    if (notifyUserId && notifyUserId !== user.id) {
      const pushPayload = buildPushPayload(eventType, {
        postId,
        commentId: comment?.id,
        actorFirstName: authorProfile?.first_name ?? undefined,
        contentPreview: contentPreview || undefined,
      });
      sendPushToUser(notifyUserId, pushPayload).catch(pushErr => {
        console.error('Failed to send comment push:', pushErr);
      });

      const { data: recipientProfile } = await supabase
        .from('profiles')
        .select('id, email, first_name, chapter, chapter_id, phone, sms_consent')
        .eq('id', notifyUserId)
        .single();

      const actorName = authorProfile?.first_name ?? 'Someone';

      // Email: post_comment or comment_reply (respect preferences)
      const allowed = await canSendEmailNotification(notifyUserId, eventType);
      if (allowed && recipientProfile?.email && recipientProfile?.first_name) {
        const chapterName = recipientProfile.chapter ?? 'Your chapter';
        if (eventType === 'post_comment') {
          EmailService.sendPostCommentNotification({
            to: recipientProfile.email,
            firstName: recipientProfile.first_name,
            chapterName,
            actorFirstName: actorName,
            contentPreview: contentPreview || '',
            postId,
          }).catch((err) => console.error('Failed to send post comment email:', err));
        } else {
          EmailService.sendCommentReplyNotification({
            to: recipientProfile.email,
            firstName: recipientProfile.first_name,
            chapterName,
            actorFirstName: actorName,
            contentPreview: contentPreview || '',
            postId,
          }).catch((err) => console.error('Failed to send comment reply email:', err));
        }
      }

      // SMS: Option A - send when phone and sms_consent present (no per-type toggle)
      if (recipientProfile?.phone && recipientProfile.sms_consent === true) {
        const { SMSService } = await import('@/lib/services/sms/smsServiceTelnyx');
        const { SMSNotificationService } = await import('@/lib/services/sms/smsNotificationService');
        const formattedPhone = SMSService.formatPhoneNumber(recipientProfile.phone);
        if (SMSService.isValidPhoneNumber(recipientProfile.phone)) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://trailblaize.net';
          const postUrl = `${baseUrl}/dashboard/post/${postId}`;
          if (eventType === 'post_comment') {
            SMSNotificationService.sendPostCommentNotification(
              formattedPhone,
              recipientProfile.first_name ?? 'Member',
              actorName,
              contentPreview || undefined,
              recipientProfile.id,
              recipientProfile.chapter_id ?? '',
              { postId, link: postUrl }
            ).catch((err) => console.error('Failed to send post comment SMS:', err));
          } else {
            SMSNotificationService.sendCommentReplyNotification(
              formattedPhone,
              recipientProfile.first_name ?? 'Member',
              actorName,
              contentPreview || undefined,
              recipientProfile.id,
              recipientProfile.chapter_id ?? '',
              { postId, link: postUrl }
            ).catch((err) => console.error('Failed to send comment reply SMS:', err));
          }
        }
      }
    }

    // Send mention notifications (fire and forget, excluding the comment/reply notification recipient)
    if (resolvedMentions.length > 0 && comment) {
      sendMentionNotifications({
        mentionedUsers: resolvedMentions,
        actorUserId: user.id,
        contentType: 'comment',
        contentId: comment.id,
        postId,
        contentPreview: content.trim().slice(0, 80),
        supabase,
      }).catch((err) => console.error('Failed to send mention notifications:', err));
    }

    return NextResponse.json({ comment });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
