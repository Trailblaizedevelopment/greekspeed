import type { Metadata } from 'next';
import {
  getOpenBridgeChapterInviteToken,
  getOpenBridgeStoreUrls,
  resolveOpenBridgeContinuePath,
} from '@/lib/utils/deferredAppRouting';
import { validateInvitationToken } from '@/lib/utils/invitationUtils';
import { OpenBridgeClient } from './OpenBridgeClient';

export const metadata: Metadata = {
  title: 'Open Trailblaize',
  description:
    'Continue to Trailblaize on the web or download the mobile app. Used when opening smart links in a browser.',
  robots: { index: false, follow: false },
};

interface OpenBridgePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Branch / app deep-link fallback: users land here in a browser when a smart link
 * does not open the native app. Query params are documented in `deferredAppRouting.ts`.
 */
export default async function OpenBridgePage({ searchParams }: OpenBridgePageProps) {
  const raw = await searchParams;
  const { continuePath, intentLabel } = resolveOpenBridgeContinuePath(raw);
  const { ios, android } = getOpenBridgeStoreUrls();

  const inviteToken = getOpenBridgeChapterInviteToken(raw);
  let chapterInviteName: string | null = null;
  if (inviteToken) {
    const validation = await validateInvitationToken(inviteToken);
    if (validation.valid && validation.chapter_name) {
      chapterInviteName = validation.chapter_name;
    }
  }

  return (
    <OpenBridgeClient
      continuePath={continuePath}
      intentLabel={intentLabel}
      chapterInviteName={chapterInviteName}
      iosUrl={ios}
      androidUrl={android}
    />
  );
}
