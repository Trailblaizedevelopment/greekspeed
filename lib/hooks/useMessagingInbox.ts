'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/supabase/auth-context';
import type { Connection } from '@/lib/contexts/ConnectionsContext';
import type { MessagingInboxPreview } from '@/types/messagingInbox';

export function useMessagingInbox() {
  const { user, session } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [previews, setPreviews] = useState<Record<string, MessagingInboxPreview>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInbox = useCallback(async () => {
    if (!user?.id || !session?.access_token) {
      setConnections([]);
      setPreviews({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/messaging/inbox', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Failed to load inbox');
      }
      const data = (await response.json()) as {
        connections?: Connection[];
        previews?: Record<string, MessagingInboxPreview>;
      };
      setConnections(data.connections ?? []);
      setPreviews(data.previews ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox');
      setConnections([]);
      setPreviews({});
    } finally {
      setLoading(false);
    }
  }, [user?.id, session?.access_token]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  return { connections, previews, loading, error, refreshInbox: fetchInbox };
}
