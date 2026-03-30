'use client';

import { cn } from '@/lib/utils';

export type MessageBubbleVariant = 'incoming' | 'outgoing';

export interface MessageBubbleProps {
  variant: MessageBubbleVariant;
  children: React.ReactNode;
  className?: string;
}

export function MessageBubble({ variant, children, className }: MessageBubbleProps) {
  return (
    <div
      className={cn(
        'max-w-full overflow-hidden px-4 py-1 shadow-sm',
        /* Chat-style corner: full rounding except the bottom corner on the “speaker” side */
        variant === 'incoming' &&
          'rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-lg border border-gray-200 bg-white text-gray-900',
        variant === 'outgoing' &&
          'rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-lg bg-brand-primary text-white',
        className
      )}
    >
      <p className="text-sm leading-snug whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {children}
      </p>
    </div>
  );
}
