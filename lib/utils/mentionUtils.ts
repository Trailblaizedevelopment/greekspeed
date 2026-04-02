/**
 * Utilities for parsing, resolving, and rendering @username mentions.
 *
 * Usernames follow the rules in usernameUtils.ts:
 *   - 3-50 chars, lowercase alphanumeric plus hyphens and dots
 *   - Cannot start/end with hyphen or dot
 *   - No consecutive dots or hyphens
 *
 * The MENTION_REGEX intentionally captures greedily and lets the resolver
 * decide whether a username is valid so that edge-case punctuation like
 * `@devin,` or `(@devin)` is handled correctly.
 */

export interface MentionData {
  username: string;
  user_id: string;
}

/**
 * Regex that matches `@username` tokens in free text.
 * Captures the username part (group 1). The character class mirrors
 * the valid-username charset from usernameUtils.ts.
 */
const MENTION_REGEX = /(?:^|(?<=[\s(,;:!?\n]))@([a-z0-9](?:[a-z0-9.-]{0,48}[a-z0-9])?)/g;

/**
 * Extract unique @username tokens from content.
 * Returns de-duplicated lowercase usernames (without the leading @).
 */
export function parseMentions(content: string): string[] {
  if (!content) return [];
  const lower = content.toLowerCase();
  const mentions = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  while ((match = regex.exec(lower)) !== null) {
    const username = match[1];
    if (username && username.length >= 3) {
      mentions.add(username);
    }
  }
  return Array.from(mentions);
}

/**
 * Given a list of candidate usernames, resolve them to user IDs
 * scoped to a chapter. Returns only the usernames that exist and
 * are accessible to the chapter.
 *
 * @param supabase  - Supabase client (service role)
 * @param usernames - Candidate usernames (lowercase, no @)
 * @param chapterId - Chapter scope for resolution
 */
export async function resolveMentions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  usernames: string[],
  chapterId: string
): Promise<MentionData[]> {
  if (usernames.length === 0) return [];

  const { data, error }: { data: Array<{ id: string; username: string | null }> | null; error: unknown } =
    await supabase
      .from('profiles')
      .select('id, username')
      .eq('chapter_id', chapterId)
      .in('username', usernames);

  if (error || !data) {
    console.error('Failed to resolve mentions:', error);
    return [];
  }

  return (data as Array<{ id: string; username: string | null }>)
    .filter((p) => !!p.username)
    .map((p) => ({ username: p.username!, user_id: p.id }));
}

/**
 * Splits content into segments: plain text and mention tokens.
 * Used by rendering code to produce React elements.
 */
export interface ContentSegment {
  type: 'text' | 'mention';
  value: string;
  /** Only present for type=mention — the matched username */
  username?: string;
}

export function segmentContentWithMentions(
  content: string,
  resolvedUsernames: Set<string>
): ContentSegment[] {
  if (!content) return [];

  const RENDER_REGEX =
    /(?:^|(?<=[\s(,;:!?\n]))@([a-z0-9](?:[a-z0-9.-]{0,48}[a-z0-9])?)/g;

  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(RENDER_REGEX.source, RENDER_REGEX.flags);
  while ((match = regex.exec(content)) !== null) {
    const username = match[1]?.toLowerCase();
    if (!username || username.length < 3 || !resolvedUsernames.has(username)) {
      continue;
    }

    const mentionStart = match.index + (match[0].length - match[1].length - 1);
    if (mentionStart > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, mentionStart) });
    }
    segments.push({ type: 'mention', value: `@${match[1]}`, username });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments;
}
