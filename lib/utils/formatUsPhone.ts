const US_PHONE_DIGITS = 10;

/** Digits only, optional leading US country code 1, capped at 10 digits. */
export function extractUsPhoneDigits(value: string): string {
  let d = value.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(0, US_PHONE_DIGITS);
}

/**
 * As-you-type display for US numbers: `434` → `434`, `4343` → `(434) 3`, … `(850) 586-0162`.
 * Matches profile / edit-profile behavior.
 */
export function formatUsPhoneInput(value: string): string {
  const digits = extractUsPhoneDigits(value);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Persist `(XXX) XXX-XXXX` only when exactly 10 digits; otherwise null. */
export function normalizeUsPhoneForStorage(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const digits = extractUsPhoneDigits(trimmed);
  if (digits.length !== US_PHONE_DIGITS) return null;
  return formatUsPhoneInput(digits);
}
