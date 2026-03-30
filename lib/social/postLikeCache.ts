import type { QueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type { Post, PostsResponse } from '@/types/posts';

export function ensureChapterFeedCache(
  queryClient: QueryClient,
  chapterId: string,
  pageSize: number,
  seed: PostsResponse,
): void {
  const key = ['posts', chapterId, pageSize] as const;
  const existing = queryClient.getQueryData<InfiniteData<PostsResponse>>(key);
  if (existing) return;
  queryClient.setQueryData<InfiniteData<PostsResponse>>(key, {
    pages: [seed],
    pageParams: [1],
  });
}

/**
 * Patch a post in every infinite feed query for this chapter (any pageSize).
 */
export function patchPostInChapterFeeds(
  queryClient: QueryClient,
  chapterId: string,
  postId: string,
  mapPost: (p: Post) => Post,
): void {
  queryClient.setQueriesData<InfiniteData<PostsResponse>>(
    { queryKey: ['posts', chapterId], exact: false },
    (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          posts: page.posts.map((post) =>
            post.id === postId ? mapPost(post) : post,
          ),
        })),
      };
    },
  );
}

export function patchPostDetailCache(
  queryClient: QueryClient,
  postId: string,
  mapPost: (p: Post) => Post,
): void {
  queryClient.setQueryData<Post>(['post', postId], (prev) => {
    if (!prev || prev.id !== postId) return prev;
    return mapPost(prev);
  });
}

export function collectChapterFeedSnapshots(
  queryClient: QueryClient,
  chapterId: string,
): Map<string, InfiniteData<PostsResponse> | undefined> {
  const snapshots = new Map<string, InfiniteData<PostsResponse> | undefined>();
  for (const q of queryClient.getQueryCache().getAll()) {
    const k = q.queryKey as unknown[];
    if (k[0] === 'posts' && k[1] === chapterId) {
      snapshots.set(
        JSON.stringify(q.queryKey),
        queryClient.getQueryData<InfiniteData<PostsResponse>>(q.queryKey),
      );
    }
  }
  return snapshots;
}

export function restoreChapterFeedSnapshots(
  queryClient: QueryClient,
  snapshots: Map<string, InfiniteData<PostsResponse> | undefined>,
): void {
  for (const [keyStr, data] of snapshots) {
    const key = JSON.parse(keyStr) as unknown[];
    queryClient.setQueryData(key, data);
  }
}
