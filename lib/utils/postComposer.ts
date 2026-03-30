import type { Post } from '@/types/posts';

/** Image URLs already present on the post payload (non-slim or after merge). */
export function getExistingImageUrlsFromPost(post: Post): string[] {
  const meta = post.metadata?.image_urls;
  if (Array.isArray(meta) && meta.length > 0) {
    return meta.filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  if (post.image_url && post.image_url.length > 0) {
    return [post.image_url];
  }
  return [];
}

/** Whether the post has at least one image URL (for `has_image` on feed/detail payloads). */
export function postHasDisplayableImage(post: Pick<Post, 'image_url' | 'metadata'>): boolean {
  return getExistingImageUrlsFromPost(post as Post).length > 0;
}
