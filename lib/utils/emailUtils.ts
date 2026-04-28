const EDU_SIGNUP_ERROR =
  'School email addresses (.edu) cannot be used for account creation. Please sign up with a personal email address.';

/**
 * Returns true when the email belongs to a .edu domain (including subdomains
 * such as mail.university.edu).
 */
export function isEduEmail(email: string): boolean {
  if (!email) return false;

  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return false;

  return domain === 'edu' || domain.endsWith('.edu');
}

/**
 * Self-serve registration (sign-up, OAuth create, public join) blocks .edu by default.
 * Set `NEXT_PUBLIC_ALLOW_EDU_SIGNUP=true` to allow campus emails (Handshake-style open access).
 */
export function isEduEmailBlockedForSelfServeSignup(email: string): boolean {
  if (process.env.NEXT_PUBLIC_ALLOW_EDU_SIGNUP === 'true') return false;
  return isEduEmail(email);
}

export { EDU_SIGNUP_ERROR };
