'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { Post } from '@/types/posts';
import { PostDetailClient } from '@/app/dashboard/post/[id]/PostDetailClient';
import { Button } from '@/components/ui/button';
import { CreatePostModal } from '@/components/features/social/CreatePostModal';
import { DeletePostModal } from '@/components/features/social/DeletePostModal';
import { ReportPostModal } from '@/components/features/social/ReportPostModal';
import { getExistingImageUrlsFromPost } from '@/lib/utils/postComposer';
import { NetworkingSpotlightCard } from '@/components/features/dashboard/dashboards/ui/NetworkingSpotlightCard';
import { MobileBottomNavigation } from '@/components/features/dashboard/dashboards/ui/MobileBottomNavigation';
import { useTogglePostLikeMutation } from '@/lib/hooks/useTogglePostLikeMutation';
import { toast } from 'react-toastify';

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getAuthHeaders } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: togglePostLike } = useTogglePostLikeMutation();
  const postId = typeof params.id === 'string' ? params.id : null;

  const [deletingPost, setDeletingPost] = useState<Post | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editDetailImageUrls, setEditDetailImageUrls] = useState<string[]>([]);

  const {
    data: post,
    isLoading: loading,
    isError,
    error,
  } = useQuery<Post, Error>({
    queryKey: ['post', postId],
    enabled: !!postId,
    queryFn: async () => {
      if (!postId) {
        throw new Error('Post not found');
      }
      const headers = getAuthHeaders();
      const res = await fetch(`/api/posts/${postId}`, { headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 404) {
          throw new Error('Post not found');
        }
        throw new Error(data?.error ?? 'Failed to load post');
      }
      return res.json();
    },
  });

  const handleLike = useCallback(
    async (likedPostId: string) => {
      if (!postId || likedPostId !== postId || !post?.chapter_id) return;

      try {
        await togglePostLike({
          postId: likedPostId,
          chapterId: post.chapter_id,
          updateDetailCache: true,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'AUTH_REQUIRED') {
          toast.error('Sign in to like posts');
          return;
        }
        toast.error(err instanceof Error ? err.message : 'Failed to update like');
      }
    },
    [post?.chapter_id, postId, togglePostLike],
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleDeletePost = useCallback(async () => {
    if (!postId || !deletingPost) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to delete post');
      }
      setDeletingPost(null);
      queryClient.removeQueries({ queryKey: ['post', postId] });
      router.back();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete post');
    } finally {
      setIsDeleting(false);
    }
  }, [deletingPost, getAuthHeaders, postId, queryClient, router]);

  const handleSaveEdit = useCallback(
    async (content: string) => {
      if (!postId) return;
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to update post');
      }
      const updated = await res.json();
      queryClient.setQueryData<Post>(['post', postId], (prev) =>
        prev ? { ...prev, ...updated } : updated,
      );
    },
    [getAuthHeaders, postId, queryClient]
  );

  useEffect(() => {
    if (!showEditModal || !post) {
      setEditDetailImageUrls([]);
      return;
    }
    const immediate = getExistingImageUrlsFromPost(post);
    if (immediate.length > 0) {
      setEditDetailImageUrls(immediate);
      return;
    }
    if (!post.has_image) {
      setEditDetailImageUrls([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/posts/${post.id}/image`, {
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
        setEditDetailImageUrls(urls);
      } catch {
        if (!cancelled) setEditDetailImageUrls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showEditModal, post, getAuthHeaders]);

  const handleSubmitReport = useCallback(
    async (reportedPostId: string, reason: string) => {
      const res = await fetch(`/api/posts/${reportedPostId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to submit report');
      }
      setShowReportModal(false);
      toast.success('Report submitted');
    },
    [getAuthHeaders]
  );

  const handleBookmark = useCallback(
    async (bookmarkPostId: string) => {
      try {
        const res = await fetch(`/api/posts/${bookmarkPostId}/bookmark`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? 'Failed to update bookmark');
        }
        const { bookmarked } = await res.json();
        queryClient.setQueryData<Post>(['post', bookmarkPostId], (prev) =>
          prev ? { ...prev, is_bookmarked: bookmarked } : prev,
        );
        toast.success(bookmarked ? 'Post saved' : 'Removed from saved');
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Failed to update bookmark');
      }
    },
    [getAuthHeaders, queryClient]
  );

  const handleCommentAdded = useCallback(() => {
    if (!postId) return;
    const queryKey: [string, string | null] = ['post', postId];
    queryClient.setQueryData<Post>(queryKey, (prev) =>
      prev
        ? {
            ...prev,
            comments_count: (prev.comments_count ?? 0) + 1,
          }
        : prev,
    );
  }, [postId, queryClient]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBack]);

  if (!postId) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
        <div className="max-w-2xl mx-auto w-full flex flex-col items-center justify-center min-h-[50vh] px-4">
          <p className="text-slate-500 mb-4">Invalid post</p>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to feed
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
        <div className="max-w-2xl mx-auto w-full flex flex-col items-center justify-center min-h-[50vh] px-4">
          <div className="w-10 h-10 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 mt-4">Loading post...</p>
        </div>
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
        <div className="max-w-2xl mx-auto w-full flex flex-col items-center justify-center min-h-[50vh] px-4">
          <p className="text-slate-500 mb-4">{error?.message ?? 'Post not found'}</p>
          <Button variant="outline" onClick={handleBack}>
            Back to feed
          </Button>
        </div>
      </div>
    );
  }

  const postContent = (
    <PostDetailClient
      post={post}
      onLike={handleLike}
      onCommentAdded={handleCommentAdded}
      onBack={handleBack}
      onDelete={() => setDeletingPost(post)}
      onEdit={() => setShowEditModal(true)}
      onReport={() => setShowReportModal(true)}
      onBookmark={handleBookmark}
    />
  );

  return (
    <>
      {/* Mobile: fixed full-viewport container (like messages). Desktop: normal flow. */}
      <div className="fixed inset-0 lg:relative lg:inset-auto flex flex-col overflow-hidden h-screen lg:h-[calc(100vh-4rem)] bg-white lg:bg-gray-50">
        <div className="flex-1 min-h-0 flex flex-col pt-[3.5rem] lg:pt-0 overflow-hidden">
          <div className="max-w-full mx-auto px-0 lg:px-6 py-0 lg:py-4 w-full flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Desktop: card layout with sidebar */}
            <div className="hidden lg:grid lg:grid-cols-12 lg:gap-6 flex-1 min-h-0 overflow-hidden items-stretch">
              <aside className="col-span-3 col-start-1 row-start-1 min-h-0 h-full flex flex-col overflow-hidden">
                <NetworkingSpotlightCard />
              </aside>
              <main className="col-span-9 col-start-4 row-start-1 flex flex-col min-h-0 min-w-0">
                <div className="flex-1 min-h-0 flex flex-col items-center">
                  <div className="w-full max-w-4xl flex flex-col flex-1 min-h-0 bg-white border border-slate-200/80 shadow-sm rounded-2xl overflow-hidden">
                    {postContent}
                  </div>
                </div>
              </main>
            </div>
            {/* Mobile/tablet: cardless full-screen */}
            <div className="lg:hidden flex-1 min-h-0 flex flex-col w-full">
              <div className="w-full flex flex-col flex-1 min-h-0 bg-white">
                {postContent}
              </div>
            </div>
          </div>
        </div>
        <MobileBottomNavigation />
      </div>

    <DeletePostModal
      isOpen={!!deletingPost}
      onClose={() => setDeletingPost(null)}
      onConfirm={handleDeletePost}
      post={deletingPost}
      isDeleting={isDeleting}
    />
    <CreatePostModal
      isOpen={showEditModal}
      onClose={() => setShowEditModal(false)}
      editPost={post}
      existingImageUrls={editDetailImageUrls}
      onSaveEdit={handleSaveEdit}
      onEditDelete={() => {
        setShowEditModal(false);
        setDeletingPost(post);
      }}
      userAvatar={post.author?.avatar_url ?? undefined}
      userName={post.author?.full_name ?? undefined}
    />
    <ReportPostModal
      isOpen={showReportModal}
      onClose={() => setShowReportModal(false)}
      post={post}
      onSubmit={handleSubmitReport}
    />
  </>
  );
}
