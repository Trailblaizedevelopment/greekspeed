import { PROFILE_SELECT_FIELD_MAX_LENGTH } from '@/lib/constants/profileConstants';

export function trimProfileSelectValue(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function clampProfileSelectValue(
  raw: string,
  maxLen: number = PROFILE_SELECT_FIELD_MAX_LENGTH
): string {
  const t = trimProfileSelectValue(raw);
  if (!t) return '';
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}
