/**
 * Heuristics for Crowded contact `mobile` before collect intents.
 * Crowded may still reject valid-looking numbers; this only flags obvious garbage.
 */
export function crowdedContactMobileLooksLikeInvalidPlaceholder(
  mobile: string | null | undefined
): boolean {
  const m = (mobile ?? '').trim();
  if (!m) return false;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(m)) {
    return true;
  }
  const digitsAndPlus = m.replace(/[\s().-]/g, '');
  if (digitsAndPlus.startsWith('+0')) return true;
  if (!/^\+[1-9]\d{6,14}$/.test(digitsAndPlus)) return true;
  return false;
}
