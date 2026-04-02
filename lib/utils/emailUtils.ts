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

export { EDU_SIGNUP_ERROR };
