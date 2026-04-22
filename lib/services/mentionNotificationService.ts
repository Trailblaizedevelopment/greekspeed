/**
 * Sends push notifications to users mentioned in posts/comments.
 *
 * Uses the existing push infrastructure (OneSignal) and email system.
 * Self-mentions are silently excluded. Each mentioned user receives at most
 * one notification per content item regardless of how many times they appear.
 */

import type { MentionData } from '@/lib/utils/mentionUtils';
import { sendPushToUser } from '@/lib/services/oneSignalPushService';
import { getEmailBaseUrl } from '@/lib/utils/urlUtils';
import { getHiddenUserIdsForViewer } from '@/lib/services/userBlockService';

interface MentionNotificationParams {
  mentionedUsers: MentionData[];
  actorUserId: string;
  contentType: 'post' | 'comment';
  contentId?: string;
  postId: string;
  contentPreview: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}

export async function sendMentionNotifications({
  mentionedUsers,
  actorUserId,
  contentType,
  postId,
  contentPreview,
  supabase,
}: MentionNotificationParams): Promise<void> {
  const recipientIds = mentionedUsers
    .map((m) => m.user_id)
    .filter((id) => id !== actorUserId);

  const uniqueIds = [...new Set(recipientIds)];
  if (uniqueIds.length === 0) return;

  const hiddenFromActor = new Set(await getHiddenUserIdsForViewer(supabase, actorUserId));
  const eligibleIds = uniqueIds.filter((id) => !hiddenFromActor.has(id));
  if (eligibleIds.length === 0) return;

  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('first_name, full_name')
    .eq('id', actorUserId)
    .single() as { data: { first_name: string | null; full_name: string | null } | null };

  const actorName = actorProfile?.first_name ?? actorProfile?.full_name ?? 'Someone';
  const base = getEmailBaseUrl();
  const url = `${base}/dashboard/post/${postId}`;

  const label = contentType === 'post' ? 'post' : 'comment';
  const body = contentPreview
    ? `${actorName} mentioned you in a ${label}: ${contentPreview}`
    : `${actorName} mentioned you in a ${label}`;

  await Promise.allSettled(
    eligibleIds.map((userId) =>
      sendPushToUser(userId, {
        title: 'You were mentioned',
        body,
        url,
      })
    )
  );
}
