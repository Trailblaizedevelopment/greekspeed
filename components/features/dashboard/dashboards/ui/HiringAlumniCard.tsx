'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, ArrowRight } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';

export function HiringAlumniCard() {
  const { profile } = useProfile();
  const chapterId = useScopedChapterId();
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chapterId) return;

    let cancelled = false;

    const fetchCount = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/alumni/hiring-count?chapter_id=${chapterId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCount(data.count ?? 0);
      } catch {
        // Silently fail — card will just not render
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCount();
    return () => { cancelled = true; };
  }, [chapterId]);

  const handleClick = () => {
    router.push('/dashboard/alumni?activelyHiring=true');
  };

  if (loading) {
    return (
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Briefcase className="h-5 w-5 text-brand-primary" />
            <span>Alumni Hiring</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (count === null || count === 0) {
    return null;
  }

  const label =
    count === 1
      ? '1 alumnus in your chapter is hiring right now'
      : `${count} alumni in your chapter are hiring right now`;

  return (
    <Card
      className="bg-white cursor-pointer transition-shadow hover:shadow-md group"
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center space-x-2">
          <Briefcase className="h-5 w-5 text-brand-primary" />
          <span>Alumni Hiring</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">{label}</p>
          <ArrowRight className="h-4 w-4 text-brand-primary shrink-0 ml-2 transition-transform group-hover:translate-x-0.5" />
        </div>
      </CardContent>
    </Card>
  );
}
