/**
 * Single entry point for POST /api/posts/[id]/like (toggle).
 */
export async function togglePostLikeRequest(
  postId: string,
  getAuthHeaders: () => Record<string, string>,
): Promise<{ liked: boolean }> {
  const res = await fetch(`/api/posts/${postId}/like`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err?.error === 'string' ? err.error : 'Failed to like post',
    );
  }
  return res.json() as Promise<{ liked: boolean }>;
}
