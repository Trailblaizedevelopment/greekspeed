import type { Post } from '@/types/posts';

export function nextLikeSnapshot(
  post: Pick<Post, 'is_liked' | 'likes_count'>,
): { is_liked: boolean; likes_count: number } {
  const prevLiked = post.is_liked ?? false;
  const prevCount = post.likes_count ?? 0;
  return {
    is_liked: !prevLiked,
    likes_count: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1,
  };
}
