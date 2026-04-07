'use client';

import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MembershipRequestEmailMailtoButtonProps {
  email: string | null | undefined;
  className?: string;
  iconClassName?: string;
}

/**
 * Opens the system default mail client with a new message to this address (`mailto:`).
 */
export function MembershipRequestEmailMailtoButton({
  email,
  className,
  iconClassName,
}: MembershipRequestEmailMailtoButtonProps) {
  const trimmed = email?.trim();
  if (!trimmed) return null;

  return (
    <a
      href={`mailto:${trimmed}`}
      className={cn(
        'inline-flex items-center justify-center rounded-full p-1 text-gray-500 hover:text-brand-primary hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/20',
        className
      )}
      aria-label={`Compose email to ${trimmed}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Mail className={cn('h-4 w-4 shrink-0', iconClassName)} aria-hidden />
    </a>
  );
}
