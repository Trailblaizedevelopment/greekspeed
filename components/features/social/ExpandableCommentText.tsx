'use client';

import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ExpandableCommentTextProps {
  commentId: string;
  children: ReactNode;
  className?: string;
}

export function ExpandableCommentText({
  commentId,
  children,
  className,
}: ExpandableCommentTextProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsTruncation, setNeedsTruncation] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    setNeedsTruncation(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    if (isExpanded) return;

    checkOverflow();

    const observer = new ResizeObserver(checkOverflow);
    if (contentRef.current) {
      observer.observe(contentRef.current);
    }
    return () => observer.disconnect();
  }, [isExpanded, checkOverflow, children]);

  return (
    <div className={className}>
      <div
        ref={contentRef}
        className={cn(
          'break-words [overflow-wrap:anywhere]',
          !isExpanded && 'line-clamp-6 sm:line-clamp-8',
        )}
      >
        {children}
      </div>
      {(needsTruncation || isExpanded) && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className="mt-1 text-xs font-medium text-brand-accent hover:text-accent-700 transition-colors"
        >
          {isExpanded ? 'View less' : 'View more'}
        </button>
      )}
    </div>
  );
}
