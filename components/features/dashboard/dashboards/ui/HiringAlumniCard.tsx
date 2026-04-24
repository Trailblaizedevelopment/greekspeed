'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, ArrowRight } from 'lucide-react';
import { useHiringAlumniCount } from '@/lib/hooks/useHiringAlumniCount';

export function HiringAlumniCard() {
  const router = useRouter();
  const { count, loading } = useHiringAlumniCount();

  const handleClick = () => {
    router.push('/dashboard/alumni?activelyHiring=true');
  };

  const cardShell =
    'bg-white rounded-2xl border shadow-sm lg:rounded-3xl lg:shadow transition-shadow';

  if (loading) {
    return (
      <Card className={cardShell}>
        <CardHeader className="space-y-0 px-5 pt-5 pb-0 text-left sm:px-6 sm:pt-6 sm:pb-0">
          <CardTitle className="text-lg flex items-center gap-2 text-left font-semibold leading-tight">
            <Briefcase
              className="h-5 w-5 shrink-0 text-brand-primary lg:hidden"
              aria-hidden
            />
            <span>Alumni Hiring</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6 sm:pt-0">
          <div className="animate-pulse space-y-1.5 text-left">
            <div className="h-4 max-w-[85%] rounded-md bg-gray-200 lg:max-w-[75%]" />
            <div className="h-3 max-w-[55%] rounded-md bg-gray-100 lg:max-w-[45%]" />
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
      className={`${cardShell} cursor-pointer hover:shadow-md group`}
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
    >
      <CardHeader className="space-y-0 px-5 pt-5 pb-0 text-left sm:px-6 sm:pt-6 sm:pb-0">
        <CardTitle className="text-lg flex w-full items-center gap-2 text-left font-semibold leading-tight">
          <Briefcase
            className="h-5 w-5 shrink-0 text-brand-primary lg:hidden"
            aria-hidden
          />
          <span>Alumni Hiring</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0 sm:px-6 sm:pb-6 sm:pt-0">
        <div className="flex items-center justify-between gap-3 text-left">
          <p className="min-w-0 flex-1 text-sm leading-snug text-gray-700">{label}</p>
          <ArrowRight
            className="h-4 w-4 shrink-0 text-brand-primary transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
      </CardContent>
    </Card>
  );
}
