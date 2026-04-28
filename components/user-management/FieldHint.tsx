'use client';

import { CircleHelp } from 'lucide-react';

/** Small help icon; browser shows `text` on hover via `title`. */
export function FieldHint({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="-m-0.5 inline-flex shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-200/80 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
      title={text}
      aria-label={text}
      onClick={(e) => e.preventDefault()}
    >
      <CircleHelp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </button>
  );
}
