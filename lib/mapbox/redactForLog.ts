/**
 * Strips Mapbox `access_token` query values from free-text so logs and error
 * messages cannot leak server secrets.
 */
export function redactAccessTokenInString(input: string): string {
  return input.replace(/access_token=[^&\s#'"]+/gi, 'access_token=[REDACTED]');
}
