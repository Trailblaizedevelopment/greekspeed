/**
 * Trailblaize support contact (aligned with marketing/legal pages).
 * TRA-581: pending chapter approval copy + links.
 */
export const SUPPORT_EMAIL = 'support@trailblaize.net';

export const SUPPORT_MAILTO_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Trailblaize — chapter membership')}`;

/** SLA-style expectation copy — not a contractual guarantee. */
export const PENDING_CHAPTER_APPROVAL_SLA_COPY =
  'Chapter administrators are notified of your request. Most reviews happen within a few hours, but it can take up to one to two business days during busy periods.';

/** Shorter SLA line for narrow viewports (e.g. pending chapter approval mobile). */
export const PENDING_CHAPTER_APPROVAL_SLA_COPY_MOBILE =
  'Admins are notified. Most reviews within hours; up to 1–2 business days when busy.';
