'use client';

import { useCallback, useMemo, useEffect, useState } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryFunctionContext,
} from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { Post, PostsResponse, CreatePostRequest, UpdatePostRequest } from '@/types/posts';
import { writeFeedCache, readFeedCache } from '@/lib/cache/feedCache';
import { useTogglePostLikeMutation } from '@/lib/hooks/useTogglePostLikeMutation';
import { toast } from 'react-toastify';

interface InitialFeedData extends PostsResponse {
  chapterId: string;
}

interface UsePostsOptions {
  initialData?: InitialFeedData;
  pageSize?: number;
}

type PostsQueryKey = ['posts', string, number];

const EMPTY_RESPONSE: PostsResponse = {
  posts: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

export function usePosts(chapterId: string, options: UsePostsOptions = {}) {
  const { user, session, getAuthHeaders } = useAuth();
  const queryClient = useQueryClient();
  const { mutateAsync: togglePostLike } = useTogglePostLikeMutation();

  const normalizedInitialData = useMemo(() => {
    if (!options.initialData) return undefined;
    if (!chapterId) return options.initialData;
    return options.initialData.chapterId === chapterId ? options.initialData : undefined;
  }, [chapterId, options.initialData]);

  // ---- Read localStorage cache as placeholder when no server data ----
  const cachedFeed = useMemo(() => {
    if (normalizedInitialData) return undefined; // Server data takes priority
    if (typeof window === 'undefined') return undefined;
    const cached = readFeedCache(chapterId);
    if (!cached) return undefined;
    return {
      pages: [cached] as PostsResponse[],
      pageParams: [1],
    } satisfies InfiniteData<PostsResponse, number>;
  }, [chapterId, normalizedInitialData]);

  const pageSize = Math.min(Math.max(options.pageSize ?? 10, 1), 50);
  const queryKey = useMemo<PostsQueryKey>(() => ['posts', chapterId, pageSize], [chapterId, pageSize]);
  const enabled = Boolean(user && session && chapterId) || Boolean(normalizedInitialData);

  const fetchPage = useCallback(
    async ({ pageParam = 1 }: QueryFunctionContext<PostsQueryKey, number>) => {
      if (!session || !chapterId) {
        return EMPTY_RESPONSE;
      }

      const headers = getAuthHeaders();
      const response = await fetch(
        `/api/posts?chapterId=${chapterId}&page=${pageParam}&limit=${pageSize}`,
        {
          headers,
        },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? 'Failed to fetch posts');
      }

      const data: PostsResponse = await response.json();
      return data;
    },
    [chapterId, getAuthHeaders, session, pageSize],
  );

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isInitialLoading,
    isRefetching,
    isPlaceholderData,
  } = useInfiniteQuery<PostsResponse, Error, InfiniteData<PostsResponse, number>, PostsQueryKey, number>({
    queryKey,
    queryFn: fetchPage,
    enabled,
    initialPageParam: 1,
    // When server-seeded, mark data as freshly fetched and keep it fresh for 5 minutes.
    // This prevents React Query from immediately refetching when `enabled` flips to true.
    staleTime: normalizedInitialData ? 5 * 60 * 1000 : undefined,
    initialDataUpdatedAt: normalizedInitialData ? Date.now() : undefined,
    // When we have server-seeded data, skip auto-refetch on mount to prevent scroll jump.
    // New posts are surfaced via the "N new posts" pill and applied on tap.
    refetchOnMount: normalizedInitialData ? false : 'always',
    refetchOnWindowFocus: false,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    initialData: normalizedInitialData
      ? {
          pages: [normalizedInitialData],
          pageParams: [1],
        }
      : undefined,
    placeholderData: cachedFeed,
  });

  // Debug logging for React Query state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[usePosts] React Query state:', {
        chapterId,
        isInitialLoading,
        isLoading,
        isRefetching,
        isPlaceholderData,
        hasData: !!data,
        dataPagesCount: data?.pages?.length ?? 0,
        hasInitialData: !!normalizedInitialData,
        hasCachedFeed: !!cachedFeed,
        enabled,
      });
    }
  }, [chapterId, isInitialLoading, isLoading, isRefetching, isPlaceholderData, data, normalizedInitialData, cachedFeed, enabled]);

  // ---- Write to localStorage after real (non-placeholder) fetch ----
  useEffect(() => {
    if (
      !isPlaceholderData &&
      data?.pages?.[0]?.posts?.length &&
      chapterId
    ) {
      writeFeedCache(chapterId, data.pages[0]);
    }
  }, [data, chapterId, isPlaceholderData]);

  const posts = useMemo(() => {
    // Priority 1: Use React Query data when available (not placeholder)
    // This ensures we show full data including metadata.link_previews after refetch
    const pages = data?.pages ?? [];
    const queryPosts = pages.flatMap((page) => page.posts);
    if (!isPlaceholderData && queryPosts.length > 0) {
      if (typeof window !== 'undefined') {
        console.log('[usePosts] Using React Query data', {
          postsCount: queryPosts.length,
          chapterId,
        });
      }
      return queryPosts;
    }

    // Priority 2: Use initialData for instant first paint (server-side rendered)
    if (normalizedInitialData?.posts && normalizedInitialData.posts.length > 0) {
      if (typeof window !== 'undefined') {
        console.log('[usePosts] Using initialData (server-side)', {
          postsCount: normalizedInitialData.posts.length,
          chapterId,
        });
      }
      return normalizedInitialData.posts;
    }
    
    // Priority 3: Use placeholderData (localStorage cache) when no query/initial data
    // This provides instant content on return visits
    if (cachedFeed?.pages?.[0]?.posts && cachedFeed.pages[0].posts.length > 0) {
      if (typeof window !== 'undefined') {
        console.log('[usePosts] Using cached feed (localStorage)', {
          postsCount: cachedFeed.pages[0].posts.length,
          chapterId,
        });
      }
      return cachedFeed.pages[0].posts;
    }
    
    // Priority 4: Fall back to initialData even if empty (for "No posts yet" state)
    // This prevents skeleton loader from showing
    if (normalizedInitialData?.posts) {
      if (typeof window !== 'undefined') {
        console.log('[usePosts] Using empty initialData', {
          postsCount: 0,
          chapterId,
        });
      }
      return normalizedInitialData.posts;
    }
    
    // Last resort: empty array (will show "No posts yet" message)
    if (typeof window !== 'undefined') {
      console.log('[usePosts] No data available, returning empty array', {
        chapterId,
        hasData: !!data,
        hasCachedFeed: !!cachedFeed,
      });
    }
    return [];
  }, [data, normalizedInitialData, cachedFeed, chapterId, isPlaceholderData]);

  const updateCachedPages = useCallback(
    (updater: (pages: PostsResponse[]) => PostsResponse[]) => {
      queryClient.setQueryData<InfiniteData<PostsResponse>>(queryKey, (existing) => {
        if (!existing) return existing;
        const updatedPages = updater(existing.pages);
        return {
          ...existing,
          pages: updatedPages,
        };
      });
    },
    [queryClient, queryKey],
  );

  const createPost = useCallback(
    async (postData: CreatePostRequest) => {
      if (!user || !chapterId || !session) return null;

      const headers = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      };

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers,
        body: JSON.stringify(postData),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? 'Failed to create post');
      }

      const { post } = await response.json();

      updateCachedPages((pages) => {
        if (pages.length === 0) {
          return [
            {
              ...EMPTY_RESPONSE,
              posts: [post],
            },
          ];
        }

        const [first, ...rest] = pages;
        const updatedFirst: PostsResponse = {
          ...first,
          posts: [post, ...first.posts],
          pagination: {
            ...first.pagination,
            total: first.pagination.total + 1,
          },
        };

        return [updatedFirst, ...rest];
      });

      return post;
    },
    [chapterId, getAuthHeaders, session, updateCachedPages, user],
  );

  const likePost = useCallback(
    async (postId: string) => {
      if (!user || !session) {
        toast.error('Sign in to like posts');
        return;
      }

      const seedFirstPage =
        normalizedInitialData &&
        normalizedInitialData.chapterId === chapterId &&
        normalizedInitialData.posts.length > 0
          ? {
              posts: normalizedInitialData.posts,
              pagination: normalizedInitialData.pagination,
            }
          : undefined;

      try {
        await togglePostLike({
          postId,
          chapterId,
          pageSize,
          seedFirstPage,
          updateDetailCache: true,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'AUTH_REQUIRED') {
          toast.error('Sign in to like posts');
          return;
        }
        throw err;
      }
    },
    [
      chapterId,
      normalizedInitialData,
      pageSize,
      session,
      togglePostLike,
      user,
    ],
  );

  const deletePost = useCallback(
    async (postId: string) => {
      if (!user || !session) return false;

      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? 'Failed to delete post');
      }

      updateCachedPages((pages) =>
        pages.map((page) => ({
          ...page,
          posts: page.posts.filter((post) => post.id !== postId),
          pagination: {
            ...page.pagination,
            total: Math.max(
              0,
              page.pagination.total -
                (page.posts.some((post) => post.id === postId) ? 1 : 0),
            ),
          },
        })),
      );

      return true;
    },
    [getAuthHeaders, session, updateCachedPages, user],
  );

  const updatePost = useCallback(
    async (postId: string, payload: UpdatePostRequest) => {
      if (!user || !session) return null;

      const response = await fetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? 'Failed to update post');
      }

      const updatedPost = await response.json();

      updateCachedPages((pages) =>
        pages.map((page) => ({
          ...page,
          posts: page.posts.map((post) =>
            post.id === postId ? { ...post, ...updatedPost } : post
          ),
        })),
      );

      return updatedPost;
    },
    [getAuthHeaders, session, updateCachedPages, user],
  );

  const toggleBookmark = useCallback(
    async (postId: string): Promise<boolean> => {
      if (!user || !session) return false;

      const response = await fetch(`/api/posts/${postId}/bookmark`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? 'Failed to update bookmark');
      }

      const { bookmarked } = await response.json();

      updateCachedPages((pages) =>
        pages.map((page) => ({
          ...page,
          posts: page.posts.map((post) =>
            post.id === postId ? { ...post, is_bookmarked: bookmarked } : post
          ),
        })),
      );

      return bookmarked;
    },
    [getAuthHeaders, session, updateCachedPages, user],
  );

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey],
  );

  // ---- "New posts" pill (Twitter pattern): avoid scroll jump by not auto-applying refetches ----
  const [newPostsCount, setNewPostsCount] = useState(0);

  const checkForNewPosts = useCallback(async () => {
    if (!session || !chapterId || posts.length === 0) return;
    const currentFirstPageIds = new Set(
      (queryClient.getQueryData<InfiniteData<PostsResponse>>(queryKey)?.pages?.[0]?.posts ?? posts.slice(0, pageSize)).map(
        (p: Post) => p.id,
      ),
    );
    try {
      const headers = getAuthHeaders();
      const response = await fetch(
        `/api/posts?chapterId=${chapterId}&page=1&limit=${pageSize}`,
        { headers },
      );
      if (!response.ok) return;
      const result: PostsResponse = await response.json();
      let count = 0;
      for (const p of result.posts) {
        if (currentFirstPageIds.has(p.id)) break;
        count++;
      }
      if (count > 0) setNewPostsCount((prev) => (prev !== count ? count : prev));
    } catch {
      // Ignore check errors (network, etc.)
    }
  }, [chapterId, getAuthHeaders, pageSize, posts.length, queryClient, queryKey, session]);

  const applyNewPosts = useCallback(() => {
    setNewPostsCount(0);
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Poll for new posts when feed has content; skip while placeholder/cache-only to avoid noise
  useEffect(() => {
    if (posts.length === 0 || isPlaceholderData) return;
    checkForNewPosts();
    const interval = setInterval(checkForNewPosts, 60 * 1000);
    return () => clearInterval(interval);
  }, [checkForNewPosts, isPlaceholderData, posts.length]);

  return {
    posts,
    error: error?.message ?? null,
    isInitialLoading,
    isLoading: isLoading || isRefetching,
    isRefetching,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    refresh,
    createPost,
    likePost,
    deletePost,
    updatePost,
    toggleBookmark,
    newPostsCount,
    applyNewPosts,
  };
}
