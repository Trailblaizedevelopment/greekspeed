import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertAuthenticatedChapterReadAccess } from '@/lib/api/chapterScopedAccess';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { id: postId, commentId } = await params;

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

    // Check if comment exists and user has access to it (include author_id for push)
    const { data: comment, error: commentError } = await supabase
      .from('post_comments')
      .select('id, post_id, author_id')
      .eq('id', commentId)
      .single();

    if (commentError || !comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Check if post exists and user has access to it
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('chapter_id')
      .eq('id', comment.post_id)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, signup_channel, is_developer')
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

    // Check if user already liked the comment
    const { data: existingLike, error: likeCheckError } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', user.id)
      .single();

    if (existingLike) {
      // Unlike the comment
      const { error: unlikeError } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id);

      if (unlikeError) {
        console.error('Comment unlike error:', unlikeError);
        return NextResponse.json({ error: 'Failed to unlike comment' }, { status: 500 });
      }

      return NextResponse.json({ liked: false });
    } else {
      // Like the comment
      const { error: likeError } = await supabase
        .from('comment_likes')
        .insert({
          comment_id: commentId,
          user_id: user.id
        });

      if (likeError) {
        console.error('Comment like error:', likeError);
        return NextResponse.json({ error: 'Failed to like comment' }, { status: 500 });
      }

      // Push and email: notify comment author when someone else likes their comment
      if (comment.author_id && comment.author_id !== user.id) {
        try {
          const { data: likerProfile } = await supabase
            .from('profiles')
            .select('first_name')
            .eq('id', user.id)
            .single();
          const { buildPushPayload } = await import('@/lib/services/notificationPushPayload');
          const { sendPushToUser } = await import('@/lib/services/oneSignalPushService');
          const payload = buildPushPayload('comment_like', {
            postId: comment.post_id,
            commentId,
            actorFirstName: likerProfile?.first_name ?? undefined,
          });
          await sendPushToUser(comment.author_id, payload);
        } catch (pushErr) {
          console.error('Failed to send comment like push:', pushErr);
        }

        const { data: authorProfile } = await supabase
          .from('profiles')
          .select('email, first_name, phone, sms_consent, chapter_id')
          .eq('id', comment.author_id)
          .single();
        const { data: likerProfile } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();
        const actorFirstName = likerProfile?.first_name ?? 'Someone';

        const { canSendEmailNotification } = await import('@/lib/utils/checkEmailPreferences');
        const allowed = await canSendEmailNotification(comment.author_id, 'comment_like');
        if (allowed && authorProfile?.email && authorProfile?.first_name) {
          const { EmailService } = await import('@/lib/services/emailService');
          EmailService.sendCommentLikeNotification({
            to: authorProfile.email,
            firstName: authorProfile.first_name,
            actorFirstName,
            postId: comment.post_id,
          }).catch((err) => console.error('Failed to send comment like email:', err));
        }

        if (authorProfile?.phone && authorProfile.sms_consent === true) {
          const { SMSService } = await import('@/lib/services/sms/smsServiceTelnyx');
          const { SMSNotificationService } = await import('@/lib/services/sms/smsNotificationService');
          const formattedPhone = SMSService.formatPhoneNumber(authorProfile.phone);
          if (SMSService.isValidPhoneNumber(authorProfile.phone)) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://trailblaize.net';
            SMSNotificationService.sendCommentLikeNotification(
              formattedPhone,
              authorProfile.first_name ?? 'Member',
              actorFirstName,
              comment.author_id,
              authorProfile.chapter_id ?? '',
              { postId: comment.post_id, link: `${baseUrl}/dashboard/post/${comment.post_id}` }
            ).catch((err) => console.error('Failed to send comment like SMS:', err));
          }
        }
      }

      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
