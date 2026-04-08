/**
 * Single entry point for POST /api/posts/[id]/like (toggle).
 */
export async function togglePostLikeRequest(
  postId: string,
  getAuthHeaders: () => Promise<Record<string, string>>,
): Promise<{ liked: boolean }> {
  const res = await fetch(`/api/posts/${postId}/like`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err?.error === 'string' ? err.error : 'Failed to like post',
    );
  }
  return res.json() as Promise<{ liked: boolean }>;
}
