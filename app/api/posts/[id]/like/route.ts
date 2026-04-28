import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertAuthenticatedChapterReadAccess } from '@/lib/api/chapterScopedAccess';

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

    // Check if user already liked the post
    const { data: existingLike, error: likeCheckError } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .single();

    if (likeCheckError && likeCheckError.code !== 'PGRST116') {
      console.error('Like check error:', likeCheckError);
      return NextResponse.json({ error: 'Failed to check like status' }, { status: 500 });
    }

    if (existingLike) {
      // Unlike the post
      const { error: unlikeError } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (unlikeError) {
        console.error('Unlike error:', unlikeError);
        return NextResponse.json({ error: 'Failed to unlike post' }, { status: 500 });
      }

      // Decrease likes count
      const { data: currentPost } = await supabase
        .from('posts')
        .select('likes_count')
        .eq('id', postId)
        .single();
      
      if (currentPost) {
        await supabase
          .from('posts')
          .update({ 
            likes_count: Math.max(0, (currentPost.likes_count || 0) - 1),
            updated_at: new Date().toISOString()
          })
          .eq('id', postId);
      }

      return NextResponse.json({ liked: false });
    } else {
      // Like the post
      const { error: likeError } = await supabase
        .from('post_likes')
        .insert({
          post_id: postId,
          user_id: user.id
        });

      if (likeError) {
        console.error('Like error:', likeError);
        return NextResponse.json({ error: 'Failed to like post' }, { status: 500 });
      }

      // Increase likes count
      const { data: currentPost } = await supabase
        .from('posts')
        .select('likes_count')
        .eq('id', postId)
        .single();
      
      if (currentPost) {
        await supabase
          .from('posts')
          .update({ 
            likes_count: (currentPost.likes_count || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', postId);
      }

      // Push and email: notify post author when someone else likes their post
      if (post.author_id && post.author_id !== user.id) {
        try {
          const { data: likerProfile } = await supabase
            .from('profiles')
            .select('first_name')
            .eq('id', user.id)
            .single();
          const { buildPushPayload } = await import('@/lib/services/notificationPushPayload');
          const { sendPushToUser } = await import('@/lib/services/oneSignalPushService');
          const payload = buildPushPayload('post_like', {
            postId,
            actorFirstName: likerProfile?.first_name ?? undefined,
          });
          await sendPushToUser(post.author_id, payload);
        } catch (pushErr) {
          console.error('Failed to send post like push:', pushErr);
        }

        const { data: authorProfile } = await supabase
          .from('profiles')
          .select('email, first_name, phone, sms_consent, chapter_id')
          .eq('id', post.author_id)
          .single();
        const { data: likerProfile } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();
        const actorFirstName = likerProfile?.first_name ?? 'Someone';

        const { canSendEmailNotification } = await import('@/lib/utils/checkEmailPreferences');
        const allowed = await canSendEmailNotification(post.author_id, 'post_like');
        if (allowed && authorProfile?.email && authorProfile?.first_name) {
          const { EmailService } = await import('@/lib/services/emailService');
          EmailService.sendPostLikeNotification({
            to: authorProfile.email,
            firstName: authorProfile.first_name,
            actorFirstName,
            postId,
          }).catch((err) => console.error('Failed to send post like email:', err));
        }

        if (authorProfile?.phone && authorProfile.sms_consent === true) {
          const { SMSService } = await import('@/lib/services/sms/smsServiceTelnyx');
          const { SMSNotificationService } = await import('@/lib/services/sms/smsNotificationService');
          const formattedPhone = SMSService.formatPhoneNumber(authorProfile.phone);
          if (SMSService.isValidPhoneNumber(authorProfile.phone)) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://trailblaize.net';
            SMSNotificationService.sendPostLikeNotification(
              formattedPhone,
              authorProfile.first_name ?? 'Member',
              actorFirstName,
              post.author_id,
              authorProfile.chapter_id ?? '',
              { postId, link: `${baseUrl}/dashboard/post/${postId}` }
            ).catch((err) => console.error('Failed to send post like SMS:', err));
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
