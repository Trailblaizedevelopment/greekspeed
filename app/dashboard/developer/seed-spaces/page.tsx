'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route: space seeding tools live under User Management → Chapters.
 */
export default function DeveloperSeedSpacesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/user-management?tab=chapters');
  }, [router]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-gray-600 text-sm">
      Redirecting to User Management → Chapters…
    </div>
  );
}
