'use client';

import type { ReactNode } from 'react';
import type { MentionData } from '@/types/posts';
import { useProfileModal } from '@/lib/contexts/ProfileModalContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { useRouter } from 'next/navigation';

interface MentionTextProps {
  content: string;
  mentions?: MentionData[];
}

/**
 * Renders post/comment content with clickable @mentions.
 * If a mention in the text matches a resolved mention from metadata,
 * it renders as a clickable span that opens the profile modal.
 * Unresolved @tokens render as plain text.
 *
 * This component handles ONLY mention rendering — URL linkification
 * should happen before or be composed with this.
 */
export function MentionText({ content, mentions }: MentionTextProps) {
  const { openUserProfile } = useProfileModal();
  const { user } = useAuth();
  const router = useRouter();

  if (!content) return null;
  if (!mentions || mentions.length === 0) {
    return <>{content}</>;
  }

  const mentionMap = new Map<string, MentionData>();
  for (const m of mentions) {
    mentionMap.set(m.username.toLowerCase(), m);
  }

  const MENTION_REGEX =
    /(?:^|(?<=[\s(,;:!?\n]))@([a-z0-9](?:[a-z0-9.-]{0,48}[a-z0-9])?)/gi;

  const elements: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  while ((match = regex.exec(content)) !== null) {
    const username = match[1]?.toLowerCase();
    const mention = username ? mentionMap.get(username) : undefined;
    if (!mention) continue;

    const mentionStart = match.index + (match[0].length - match[1].length - 1);
    if (mentionStart > lastIndex) {
      elements.push(content.slice(lastIndex, mentionStart));
    }

    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (user?.id === mention.user_id) {
        router.push('/dashboard/profile');
      } else {
        openUserProfile(mention.user_id);
      }
    };

    elements.push(
      <span
        key={`mention-${match.index}`}
        onClick={handleClick}
        className="text-brand-primary font-medium cursor-pointer hover:underline"
        role="link"
        tabIndex={0}
      >
        @{match[1]}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    elements.push(content.slice(lastIndex));
  }

  if (elements.length === 0) {
    return <>{content}</>;
  }

  return <>{elements}</>;
}
