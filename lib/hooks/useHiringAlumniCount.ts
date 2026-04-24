'use client';

import { useState, useEffect } from 'react';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';

export function useHiringAlumniCount() {
  const chapterId = useScopedChapterId();
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chapterId) {
      setLoading(false);
      setCount(null);
      return;
    }

    let cancelled = false;

    const fetchCount = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/alumni/hiring-count?chapter_id=${chapterId}`);
        if (!res.ok) {
          if (!cancelled) setCount(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setCount(data.count ?? 0);
      } catch {
        if (!cancelled) setCount(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCount();
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  return { count, loading, chapterId };
}
