'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { Post, PostsResponse } from '@/types/posts';
import { togglePostLikeRequest } from '@/lib/social/postLikeApi';
import { nextLikeSnapshot } from '@/lib/social/postLikeState';
import {
  collectChapterFeedSnapshots,
  ensureChapterFeedCache,
  patchPostDetailCache,
  patchPostInChapterFeeds,
  restoreChapterFeedSnapshots,
} from '@/lib/social/postLikeCache';

export type TogglePostLikeVariables = {
  postId: string;
  /** Patch all `['posts', chapterId, *]` infinite caches */
  chapterId?: string;
  /** With `seedFirstPage`, seeds empty React Query cache before optimistic update */
  pageSize?: number;
  seedFirstPage?: PostsResponse;
  /** When true (default), updates `['post', postId]` if loaded */
  updateDetailCache?: boolean;
  /**
   * When the post exists only in local UI state (e.g. profile `useUserPosts`) and not yet
   * in React Query, pass current like state so the optimistic toggle is correct.
   */
  optimisticBase?: Pick<Post, 'is_liked' | 'likes_count'>;
};

type MutationContext = {
  previousDetail: Post | undefined;
  feedSnapshots: Map<string, InfiniteData<PostsResponse> | undefined>;
  chapterId?: string;
};

function findPostInCaches(
  queryClient: QueryClient,
  postId: string,
  chapterId?: string,
  pageSize?: number,
): Pick<Post, 'is_liked' | 'likes_count'> | null {
  const detail = queryClient.getQueryData<Post>(['post', postId]);
  if (detail) {
    return {
      is_liked: detail.is_liked,
      likes_count: detail.likes_count,
    };
  }
  if (chapterId) {
    if (pageSize !== undefined) {
      const feed = queryClient.getQueryData<InfiniteData<PostsResponse>>([
        'posts',
        chapterId,
        pageSize,
      ]);
      const found = feed?.pages?.flatMap((p) => p.posts).find((p) => p.id === postId);
      if (found) {
        return {
          is_liked: found.is_liked,
          likes_count: found.likes_count,
        };
      }
    }
    for (const q of queryClient.getQueryCache().getAll()) {
      const k = q.queryKey as unknown[];
      if (k[0] !== 'posts' || k[1] !== chapterId) continue;
      const data = queryClient.getQueryData<InfiniteData<PostsResponse>>(q.queryKey);
      const found = data?.pages?.flatMap((p) => p.posts).find((p) => p.id === postId);
      if (found) {
        return {
          is_liked: found.is_liked,
          likes_count: found.likes_count,
        };
      }
    }
  }
  return null;
}

export function useTogglePostLikeMutation() {
  const queryClient = useQueryClient();
  const { user, session, getAuthHeaders } = useAuth();

  return useMutation<{ liked: boolean }, Error, TogglePostLikeVariables, MutationContext | undefined>({
    mutationFn: async (vars) => togglePostLikeRequest(vars.postId, getAuthHeaders),
    onMutate: async (vars) => {
      if (!user || !session) {
        throw new Error('AUTH_REQUIRED');
      }

      const {
        postId,
        chapterId,
        pageSize,
        seedFirstPage,
        updateDetailCache = true,
        optimisticBase,
      } = vars;

      await queryClient.cancelQueries({ queryKey: ['post', postId] });
      if (chapterId) {
        await queryClient.cancelQueries({ queryKey: ['posts', chapterId] });
      }

      const previousDetail = queryClient.getQueryData<Post>(['post', postId]);
      const feedSnapshots = chapterId
        ? collectChapterFeedSnapshots(queryClient, chapterId)
        : new Map<string, InfiniteData<PostsResponse> | undefined>();

      const base =
        optimisticBase ??
        findPostInCaches(queryClient, postId, chapterId, pageSize) ??
        ({ is_liked: false, likes_count: 0 } as Pick<
          Post,
          'is_liked' | 'likes_count'
        >);

      if (chapterId && pageSize !== undefined && seedFirstPage) {
        ensureChapterFeedCache(queryClient, chapterId, pageSize, seedFirstPage);
      }

      const next = nextLikeSnapshot(base);
      const mapPost = (p: Post): Post =>
        p.id === postId
          ? { ...p, is_liked: next.is_liked, likes_count: next.likes_count }
          : p;

      if (chapterId) {
        patchPostInChapterFeeds(queryClient, chapterId, postId, mapPost);
      }

      if (updateDetailCache) {
        patchPostDetailCache(queryClient, postId, mapPost);
      }

      return {
        previousDetail,
        feedSnapshots,
        chapterId,
      };
    },
    onError: (err, vars, context) => {
      if (err.message === 'AUTH_REQUIRED') return;

      if (context?.previousDetail !== undefined) {
        queryClient.setQueryData(['post', vars.postId], context.previousDetail);
      }

      if (context?.chapterId && context.feedSnapshots.size > 0) {
        restoreChapterFeedSnapshots(queryClient, context.feedSnapshots);
      }
    },
    onSuccess: (data, vars) => {
      const { postId, chapterId } = vars;
      const reconcile = (p: Post): Post =>
        p.id === postId ? { ...p, is_liked: data.liked } : p;

      queryClient.setQueryData<Post>(['post', postId], (prev) =>
        prev ? reconcile(prev) : prev,
      );

      if (chapterId) {
        patchPostInChapterFeeds(queryClient, chapterId, postId, reconcile);
      }
    },
  });
}
