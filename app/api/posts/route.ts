import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchLinkPreviewsServer } from '@/lib/services/linkPreviewService';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { LinkPreview } from '@/types/posts';
import { postHasDisplayableImage } from '@/lib/utils/postComposer';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId');
    const page = parseInt(searchParams.get('page') || '1');
    const requestedLimit = parseInt(searchParams.get('limit') || '10');
    const limit = Math.min(Math.max(requestedLimit, 1), 50);

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID required' }, { status: 400 });
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

    // --- ADD DEVELOPER BYPASS LOGIC ---
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, is_developer')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isDeveloper = profile.is_developer === true;
    const isOwnChapter = profile.chapter_id === chapterId;

    // Developers can view any chapter; others only own chapter or (if governance) managed chapters
    if (!isDeveloper && !isOwnChapter) {
      const managedIds = await getManagedChapterIds(supabase, user.id);
      if (!managedIds.length || !managedIds.includes(chapterId)) {
        return NextResponse.json(
          { error: 'Insufficient permissions to view another chapter' },
          { status: 403 },
        );
      }
    }

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // -------------------------------------------------------------------------
    // Parallelize all three queries instead of running them sequentially.
    // This mirrors the pattern already used in the server RSC (page.tsx).
    // -------------------------------------------------------------------------
    const [postsResult, likesResult, bookmarksResult, countResult] = await Promise.all([
      // Query 1: Posts with author only (no comments - loaded on-demand)
      supabase
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
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),

      // Query 2: User likes (runs in parallel — filtered to post IDs after)
      supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', user.id),

      // Query 3: User bookmarks (filtered to post IDs after)
      supabase
        .from('post_bookmarks')
        .select('post_id')
        .eq('user_id', user.id),

      // Query 4: Total count for pagination
      supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('chapter_id', chapterId),
    ]);

    const { data: posts, error: postsError } = postsResult;
    const { data: userLikes, error: likesError } = likesResult;
    const { data: userBookmarks, error: bookmarksError } = bookmarksResult;
    const { count: totalCount } = countResult;

    if (postsError) {
      console.error('Posts fetch error:', postsError);
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }

    if (likesError) {
      console.error('Likes fetch error:', likesError);
    }
    if (bookmarksError) {
      console.error('Bookmarks fetch error:', bookmarksError);
    }

    // Scope likes and bookmarks to only the fetched post IDs for efficiency
    const postIds = new Set(posts?.map(p => p.id) || []);
    const likedPostIds = new Set(
      userLikes?.filter(like => postIds.has(like.post_id)).map(like => like.post_id) ?? []
    );
    const bookmarkedPostIds = new Set(
      userBookmarks?.filter(b => postIds.has(b.post_id)).map(b => b.post_id) ?? []
    );

    // Transform the data to include like/bookmark status and author info
    const transformedPosts =
      posts?.map((post) => {
        const author = Array.isArray(post.author)
          ? post.author[0] || null
          : post.author || null;

        return {
          ...post,
          has_image: postHasDisplayableImage(post),
          author,
          is_liked: likedPostIds.has(post.id),
          is_bookmarked: bookmarkedPostIds.has(post.id),
          is_author: post.author_id === user.id,
          likes_count: post.likes_count || 0,
          comments_count: post.comments_count || 0,
          shares_count: post.shares_count || 0,
        };
      }) || [];

    return NextResponse.json(
      {
        posts: transformedPosts,
        pagination: {
          page,
          limit,
          total: totalCount || 0,
          totalPages: Math.ceil((totalCount || 0) / limit),
        },
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();
    const { content, post_type, image_url, metadata } = body;

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

    // Get user profile to verify chapter
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.chapter_id) {
      return NextResponse.json({ error: 'User not associated with a chapter' }, { status: 400 });
    }

    // Check if user has permission to create posts
    const allowedRoles = ['admin', 'alumni', 'active_member'];
    if (!profile.role || !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Validate post type
    if (post_type === 'image' && !image_url) {
      return NextResponse.json({ error: 'Image URL required for image posts' }, { status: 400 });
    }

    if (post_type === 'text' && !content.trim()) {
      return NextResponse.json({ error: 'Content required for text posts' }, { status: 400 });
    }

    // Extract URLs and fetch link previews (don't block post creation if this fails)
    let linkPreviews: LinkPreview[] = [];
    if (content) {
      try {
        const previewResults = await fetchLinkPreviewsServer(content);
        linkPreviews = previewResults
          .filter(result => result.preview)
          .map(result => result.preview!);
      } catch (error) {
        console.error('Error fetching link previews:', error);
        // Continue without previews - don't block post creation
      }
    }

    // Update metadata to include link previews
    const finalMetadata = {
      ...(metadata || {}),
      ...(linkPreviews.length > 0 ? { link_previews: linkPreviews } : {}),
    };

    // Create post
    const { data: post, error: createError } = await supabase
      .from('posts')
      .insert({
        chapter_id: profile.chapter_id,
        author_id: user.id,
        content: content?.trim() || '',
        post_type,
        image_url: image_url || null,
        metadata: finalMetadata,
        likes_count: 0,
        comments_count: 0,
        shares_count: 0
      })
      .select(`
        *,
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
      .single();

    if (createError) {
      console.error('Post creation error:', createError);
      return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
    }

    return NextResponse.json({
      post: {
        ...post,
        has_image: post ? postHasDisplayableImage(post) : false,
        comments_count: post?.comments_count || 0,
        comments_preview: [],
      },
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
