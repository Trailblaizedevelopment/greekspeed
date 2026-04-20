import type { Metadata } from 'next';
import {
  getOpenBridgeStoreUrls,
  resolveOpenBridgeContinuePath,
} from '@/lib/utils/deferredAppRouting';
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

  return (
    <OpenBridgeClient
      continuePath={continuePath}
      intentLabel={intentLabel}
      iosUrl={ios}
      androidUrl={android}
    />
  );
}
