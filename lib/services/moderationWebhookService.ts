/**
 * Optional ops notification for moderation-related events (user block, post report, etc.).
 * Set MODERATION_WEBHOOK_URL to a Slack/Discord/custom HTTPS endpoint that accepts JSON POSTs.
 */
export function notifyModerationWebhook(payload: Record<string, unknown>): void {
  const url = process.env.MODERATION_WEBHOOK_URL;
  if (!url) return;

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      source: 'trailblaize',
      sent_at: new Date().toISOString(),
    }),
  }).catch((err) => {
    console.error('moderation webhook failed:', err);
  });
}
