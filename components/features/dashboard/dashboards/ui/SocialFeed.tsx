'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Image as ImageIcon, Paperclip, Calendar, Smile } from 'lucide-react';
import { usePosts } from '@/lib/hooks/usePosts';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { useConnections } from '@/lib/contexts/ConnectionsContext';
import { cn } from '@/lib/utils';
import { CreatePostModal } from '@/components/features/social/CreatePostModal';
import { DeletePostModal } from '@/components/features/social/DeletePostModal';
import { ReportPostModal } from '@/components/features/social/ReportPostModal';
import { getExistingImageUrlsFromPost } from '@/lib/utils/postComposer';
import { PostCard } from '@/components/features/social/PostCard';
import type { Post, CreatePostRequest, PostsResponse } from '@/types/posts';
import ImageWithFallback from '@/components/figma/ImageWithFallback';
import { toast } from 'react-toastify';

export interface SocialFeedInitialData {
  posts: Post[];
  pagination: PostsResponse['pagination'];
  chapterId: string;
}

interface SocialFeedProps {
  chapterId: string;
  initialData?: SocialFeedInitialData;
}

export function SocialFeed({ chapterId, initialData }: SocialFeedProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [reportPost, setReportPost] = useState<Post | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [feedFilter, setFeedFilter] = useState<'all' | 'connections'>('all');

  // CRITICAL: Store initialData posts immediately in a ref that persists
  // This ensures we can show posts even before React Query hydrates
  // Following industry standards (Facebook/Instagram/TikTok) - always show initial content immediately
  const initialPostsRef = useRef<Post[]>(initialData?.posts ?? []);
  
  // Update ref if initialData changes
  // If chapterId changes, clear old posts to prevent showing wrong chapter's posts
  useEffect(() => {
    // If chapterId changed and doesn't match initialData, clear the ref
    if (initialData?.chapterId && initialData.chapterId !== chapterId) {
      initialPostsRef.current = [];
      if (typeof window !== 'undefined') {
        console.log('[SocialFeed] Cleared initialPostsRef due to chapterId mismatch', {
          initialDataChapterId: initialData.chapterId,
          currentChapterId: chapterId,
        });
      }
    }
    
    // Update ref with new initialData if it has posts and matches current chapter
    if (initialData?.posts && initialData.posts.length > 0 && initialData.chapterId === chapterId) {
      initialPostsRef.current = initialData.posts;
      if (typeof window !== 'undefined') {
        console.log('[SocialFeed] Updated initialPostsRef with new initialData', {
          postsCount: initialData.posts.length,
          chapterId: initialData.chapterId,
        });
      }
    }
  }, [initialData, chapterId]);

  // Debug: Log initial props on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[SocialFeed] Component mounted with props:', {
        chapterId,
        hasInitialData: !!initialData,
        initialDataPostsCount: initialData?.posts?.length ?? 0,
        initialDataChapterId: initialData?.chapterId,
        initialPostsRefCount: initialPostsRef.current.length,
        timestamp: new Date().toISOString(),
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  const {
    posts,
    error,
    isInitialLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refresh,
    createPost,
    likePost,
    deletePost,
    updatePost,
    toggleBookmark,
    newPostsCount,
    applyNewPosts,
  } = usePosts(chapterId, { initialData });

  // Keep ref aligned with React Query so optimistic likes never diverge from mergedPosts
  useEffect(() => {
    if (posts.length > 0) {
      initialPostsRef.current = posts;
    }
  }, [posts]);

  const { profile } = useProfile();
  const { user, getAuthHeaders } = useAuth();

  const [editComposerImageUrls, setEditComposerImageUrls] = useState<string[]>([]);
  const [deleteModalPost, setDeleteModalPost] = useState<Post | null>(null);
  const [isDeletingFromFeedModal, setIsDeletingFromFeedModal] = useState(false);
  const { connections } = useConnections();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // CRITICAL: Use initialData posts immediately if React Query hasn't loaded yet
  // This ensures instant rendering on first paint (industry standard approach)
  // Priority: React Query posts > initialData posts from ref > empty array
  const mergedPosts = useMemo(() => {
    // Priority 1: If we have posts from React Query, use those (most up-to-date)
    if (posts.length > 0) {
      return posts;
    }
    // Priority 2: Use initialData posts from ref (instant fallback for first paint)
    // This is the key to showing content immediately like Facebook/Instagram/TikTok
    if (initialPostsRef.current.length > 0) {
      if (typeof window !== 'undefined') {
        console.log('[SocialFeed] Using initialData posts from ref (instant fallback)', {
          postsCount: initialPostsRef.current.length,
          reactQueryPostsCount: posts.length,
        });
      }
      return initialPostsRef.current;
    }
    // Priority 3: Empty array (will show "No posts yet")
    return posts;
  }, [posts]);

  // Accepted connections only: set of peer user IDs (exclude self; only posts from connections).
  const connectedUserIds = useMemo(() => {
    if (!user?.id || !connections?.length) return new Set<string>();
    const ids = new Set<string>();
    for (const conn of connections) {
      if (conn.status !== 'accepted') continue;
      const peerId = conn.requester_id === user.id ? conn.recipient_id : conn.requester_id;
      if (peerId) ids.add(peerId);
    }
    return ids;
  }, [connections, user?.id]);

  const filteredPosts = useMemo(() => {
    if (feedFilter === 'all') return mergedPosts;
    return mergedPosts.filter(
      (p) => p.author_id && connectedUserIds.has(p.author_id)
    );
  }, [mergedPosts, feedFilter, connectedUserIds]);

  useEffect(() => {
    const handleScroll = () => setHasScrolled(true);
    window.addEventListener('scroll', handleScroll, { once: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!expandedPostId) return;
    const stillExists = filteredPosts.some((post) => post.id === expandedPostId);
    if (!stillExists) {
      setExpandedPostId(null);
    }
  }, [expandedPostId, filteredPosts]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage || !hasScrolled) return; // ← Added !hasScrolled

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px 0px' },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, hasScrolled]); // ← Added hasScrolled

  const rowVirtualizer = useWindowVirtualizer({
    count: filteredPosts.length,
    estimateSize: () => 420,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 420,
    overscan: 8,
    scrollToFn: () => null,
  });

  const invalidateFeedRowHeights = useCallback(() => {
    requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });
  }, [rowVirtualizer]);

  const handleCreatePost = async (postData: CreatePostRequest) => {
    try {
      await createPost(postData);
    } catch (error) {
      console.error('Failed to create post:', error);
    }
  };

  const handleLikePost = async (postId: string) => {
    try {
      await likePost(postId);
    } catch (error) {
      console.error('Failed to like post:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to like post');
    }
  };

  const handleCommentAdded = () => {
    refresh();
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deletePost(postId);
    } catch (error) {
      console.error('Failed to delete post:', error);
    }
  };

  const handleEditPost = (postId: string) => {
    const post = mergedPosts.find((p) => p.id === postId) ?? null;
    setEditingPost(post);
  };

  const handleSaveEdit = async (content: string) => {
    if (!editingPost) return;
    await updatePost(editingPost.id, { content });
    setEditingPost(null);
  };

  useEffect(() => {
    if (!editingPost) {
      setEditComposerImageUrls([]);
      return;
    }
    const immediate = getExistingImageUrlsFromPost(editingPost);
    if (immediate.length > 0) {
      setEditComposerImageUrls(immediate);
      return;
    }
    if (!editingPost.has_image) {
      setEditComposerImageUrls([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/posts/${editingPost.id}/image`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const urls =
          Array.isArray(data.image_urls) && data.image_urls.length > 0
            ? data.image_urls
            : data.image_url
              ? [data.image_url]
              : [];
        setEditComposerImageUrls(urls);
      } catch {
        if (!cancelled) setEditComposerImageUrls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingPost, getAuthHeaders]);

  const handleEditDeleteFromComposer = () => {
    if (!editingPost) return;
    const toDelete = editingPost;
    setEditingPost(null);
    setDeleteModalPost(toDelete);
  };

  const handleConfirmDeleteFromFeedModal = async () => {
    if (!deleteModalPost) return;
    setIsDeletingFromFeedModal(true);
    try {
      await deletePost(deleteModalPost.id);
      setDeleteModalPost(null);
    } catch (error) {
      console.error('Failed to delete post:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete post');
    } finally {
      setIsDeletingFromFeedModal(false);
    }
  };

  const handleReportPost = (postId: string) => {
    const post = mergedPosts.find((p) => p.id === postId) ?? null;
    setReportPost(post);
  };

  const handleSubmitReport = async (postId: string, reason: string) => {
    const res = await fetch(`/api/posts/${postId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? 'Failed to submit report');
    }
    setReportPost(null);
    toast.success('Report submitted');
  };

  const handleBookmark = async (postId: string) => {
    try {
      const bookmarked = await toggleBookmark(postId);
      toast.success(bookmarked ? 'Post saved' : 'Removed from saved');
    } catch (error) {
      console.error('Bookmark failed:', error);
      toast.error('Failed to update bookmark');
    }
  };

  // REMOVED: Skeleton loader - never show skeleton, always render feed
  // The feed will show "No posts yet" if empty, or cached/initial posts immediately
  // Debug logging to track loading state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[SocialFeed] Render state:', {
        mergedPostsCount: mergedPosts.length,
        reactQueryPostsCount: posts.length,
        initialPostsRefCount: initialPostsRef.current.length,
        isInitialLoading,
        hasInitialData: !!initialData,
        initialDataPostsCount: initialData?.posts?.length ?? 0,
        chapterId,
        dataSource: posts.length > 0 ? 'react-query' : initialPostsRef.current.length > 0 ? 'initial-data-ref' : 'empty',
      });
    }
  }, [mergedPosts.length, posts.length, isInitialLoading, initialData, chapterId]);

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">Error loading posts: {error}</p>
        <Button onClick={() => refresh()} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        className="space-y-2 sm:space-y-5 w-[calc(100%+2rem)] -mx-4 max-w-none sm:mx-auto sm:w-full sm:max-w-2xl"
        style={{
          // Use mergedPosts for minHeight calculation to ensure proper layout
          minHeight: mergedPosts.length > 0
            ? `${Math.min(mergedPosts.length * 400, 2000)}px` // Cap at 2000px
            : '600px'
        }}
      >
        <Card className="hidden sm:block rounded-2xl border border-gray-100 bg-white/80 shadow-sm transition hover:shadow-md">
          <CardContent className="p-0">
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="h-12 w-12 rounded-full bg-primary-100/80 flex items-center justify-center text-brand-primary-hover text-sm font-semibold shrink-0 overflow-hidden ring-2 ring-white shadow-sm">
                {profile?.avatar_url ? (
                  <ImageWithFallback
                    src={profile.avatar_url}
                    alt={profile.full_name || 'User'}
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  profile?.first_name?.charAt(0) || 'U'
                )}
              </div>
              <div className="flex-1">
                <Button
                  variant="outline"
                  className="flex w-full items-center justify-start rounded-full border border-dashed border-gray-200 bg-gray-50 px-5 py-2.5 text-left text-gray-500 transition hover:border-gray-300 hover:bg-white hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-primary-200"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  Start a post…
                </Button>
              </div>
            </div>
            <div className="border-t border-gray-100 bg-gray-50/70 px-5 py-3">
              <div className="flex items-center gap-5 text-sm text-gray-500">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 rounded-full px-2 py-1 text-gray-500 transition hover:bg-white hover:text-gray-700"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <ImageIcon className="h-4 w-4 text-accent-500" />
                  Photo
                </Button>
                {/*
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 rounded-full px-2 py-1 text-gray-500 transition hover:bg-white hover:text-gray-700"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <Smile className="h-4 w-4 text-slate-500" />
                  Emoji
                </Button>
                */}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filter tabs: minimal text + pipe on mobile; boxed segmented control on desktop. No counts. */}
        <div
          role="tablist"
          aria-label="Feed filter"
          className="flex w-full items-center justify-center gap-0 sm:rounded-xl sm:border sm:border-gray-200 sm:bg-gray-50/80 sm:p-1"
        >
          {[
            { id: 'all' as const, label: 'All' },
            { id: 'connections' as const, label: 'Connections' },
          ].map((tab, index) => (
            <span key={tab.id} className="flex min-w-0 flex-1 items-center sm:flex-1">
              {index > 0 && (
                <span
                  className="pointer-events-none px-2 text-gray-300 sm:hidden"
                  aria-hidden
                >
                  |
                </span>
              )}
              <button
                type="button"
                onClick={() => setFeedFilter(tab.id)}
                role="tab"
                aria-selected={feedFilter === tab.id}
                aria-label={tab.label}
                className={cn(
                  'w-full text-center text-sm font-medium transition-colors py-2 px-2 sm:flex sm:flex-1 sm:items-center sm:justify-center sm:rounded-lg sm:py-2.5 sm:px-3',
                  feedFilter === tab.id
                    ? 'text-gray-900 sm:bg-white sm:shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 sm:text-gray-600 sm:hover:bg-white/50 sm:hover:text-gray-900'
                )}
              >
                {tab.label}
              </button>
            </span>
          ))}
        </div>

        {/* Only render pill slot when there are new posts to show (avoids empty gap above feed) */}
        {mergedPosts.length > 0 && newPostsCount > 0 && (
          <div className="flex min-h-11 items-center justify-center py-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-brand-primary/30 bg-white px-4 py-2 text-sm font-medium text-brand-primary shadow-sm transition hover:bg-brand-primary/5 hover:border-brand-primary/50 focus-visible:ring-2 focus-visible:ring-brand-primary/20"
              onClick={() => {
                applyNewPosts();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-label={`${newPostsCount} new post${newPostsCount === 1 ? '' : 's'} available. Tap to load.`}
            >
              {newPostsCount} new post{newPostsCount === 1 ? '' : 's'}
            </Button>
          </div>
        )}

        {/* Loading: show spinner until first fetch completes; empty state only when loaded with 0 posts */}
        {isInitialLoading && mergedPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16 gap-3">
            <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm sm:text-base">Loading feed…</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            {feedFilter === 'connections' && mergedPosts.length > 0 ? (
              <>
                <p className="text-gray-500 text-lg sm:text-base">No posts from your connections yet.</p>
                <p className="text-sm text-gray-400 mt-2">Connect with members to see their posts here.</p>
              </>
            ) : (
              <>
                <p className="text-gray-500 text-lg sm:text-base">No posts yet</p>
                <p className="text-sm text-gray-400 mt-2">Be the first to share something!</p>
              </>
            )}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-none border-0 bg-white shadow-none border-t border-gray-200 sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-sm">
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const post = filteredPosts[virtualRow.index];
                if (!post) return null;

                return (
                  <div
                    key={post.id}
                    data-index={virtualRow.index}
                    className="absolute left-0 right-0"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      width: '100%',
                    }}
                    ref={(el) => {
                      if (el) {
                        rowVirtualizer.measureElement(el);
                      }
                    }}
                  >
                    <PostCard
                      post={post}
                      onLike={handleLikePost}
                      onDelete={handleDeletePost}
                      onEdit={handleEditPost}
                      onReport={handleReportPost}
                      onBookmark={handleBookmark}
                      onCommentAdded={handleCommentAdded}
                      isExpanded={expandedPostId === post.id}
                      variant="feed"
                      showDivider={virtualRow.index < filteredPosts.length - 1}
                      onToggleExpand={() => {
                        setExpandedPostId((prev) => (prev === post.id ? null : post.id));
                        invalidateFeedRowHeights();
                      }}
                      onLayoutInvalidate={invalidateFeedRowHeights}
                    />
                  </div>
                );
              })}
            </div>
            <div ref={loadMoreRef} className="h-px w-full" />
            {/* Fixed-height slot: loading and end message live here to prevent scroll jump */}
            <div className="flex min-h-12 flex-shrink-0 items-center justify-center py-3">
              {isFetchingNextPage ? (
                <span className="text-xs text-gray-400">Loading...</span>
              ) : !hasNextPage && filteredPosts.length > 0 ? (
                <span className="text-sm text-gray-400">You're all caught up.</span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div
        onClick={() => setIsCreateModalOpen(true)}
        className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full sm:hidden flex items-center justify-center cursor-pointer group bg-brand-primary hover:bg-brand-primary-hover transition-colors"
        style={{
          boxShadow: `
            0 8px 16px rgba(0, 0, 0, 0.25),
            0 4px 8px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.3),
            inset 0 -1px 0 rgba(0, 0, 0, 0.2)
          `,
          border: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {/* Inner glow effect */}
        <div 
          className="absolute inset-0 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), transparent 70%)',
          }}
        />
        {/* Icon */}
        <Plus 
          className="h-6 w-6 text-white relative z-10 drop-shadow-lg transition-transform duration-200 group-hover:scale-110"
          style={{
            filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))',
          }}
        />
        {/* Hover shine effect */}
        <div 
          className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: 'radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.3), transparent 60%)',
          }}
        />
      </div>

      <CreatePostModal
        isOpen={isCreateModalOpen || !!editingPost}
        onClose={() => {
          if (editingPost) setEditingPost(null);
          else setIsCreateModalOpen(false);
        }}
        onSubmit={handleCreatePost}
        editPost={editingPost}
        existingImageUrls={editComposerImageUrls}
        onSaveEdit={handleSaveEdit}
        onEditDelete={editingPost ? handleEditDeleteFromComposer : undefined}
        userAvatar={profile?.avatar_url || undefined}
        userName={profile?.full_name || undefined}
      />

      <DeletePostModal
        isOpen={!!deleteModalPost}
        onClose={() => setDeleteModalPost(null)}
        onConfirm={handleConfirmDeleteFromFeedModal}
        post={deleteModalPost}
        isDeleting={isDeletingFromFeedModal}
      />

      <ReportPostModal
        isOpen={!!reportPost}
        onClose={() => setReportPost(null)}
        post={reportPost}
        onSubmit={handleSubmitReport}
      />
    </>
  );
} 