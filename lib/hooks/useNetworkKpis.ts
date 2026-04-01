'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/supabase/auth-context';
import type { NetworkKpis } from '@/types/governance';

export function useNetworkKpis() {
  const { session, getAuthHeaders } = useAuth();

  return useQuery<NetworkKpis>({
    queryKey: ['governance', 'network-kpis'],
    queryFn: async () => {
      const response = await fetch('/api/governance/network-kpis', {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error('Failed to fetch network KPIs');
      }
      return response.json();
    },
    enabled: !!session?.access_token,
    staleTime: 60_000,
  });
}
