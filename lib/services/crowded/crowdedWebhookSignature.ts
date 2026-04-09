import { createHmac, timingSafeEqual } from 'crypto';

/** Header names Crowded may use (confirm against first live delivery). */
const SIGNATURE_HEADER_CANDIDATES = [
  'x-crowded-signature',
  'crowded-signature',
  'x-webhook-signature',
  'webhook-signature',
  'x-signature',
  'signature',
];

function normalizeSignatureHeader(value: string): string[] {
  const v = value.trim();
  const out: string[] = [v];
  const lower = v.toLowerCase();
  if (lower.startsWith('sha256=')) {
    out.push(v.slice('sha256='.length).trim());
  }
  if (lower.startsWith('v1=')) {
    out.push(v.slice('v1='.length).trim());
  }
  const commaParts = v.split(',').map((p) => p.trim()).filter(Boolean);
  for (const p of commaParts) {
    const [k, val] = p.split('=').map((s) => s.trim());
    if (val && (k.toLowerCase() === 'v1' || k.toLowerCase() === 'sha256')) {
      out.push(val.replace(/^"|"$/g, ''));
    }
  }
  return [...new Set(out)];
}

/**
 * Verifies HMAC-SHA256(rawBody, secret) as lowercase hex against incoming headers.
 * Crowded’s exact scheme may differ — adjust after capturing a real POST (Pass 4).
 */
export function verifyCrowdedWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret: string
): boolean {
  const expectedHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');

  for (const name of SIGNATURE_HEADER_CANDIDATES) {
    const raw = headers.get(name);
    if (!raw) continue;
    for (const candidate of normalizeSignatureHeader(raw)) {
      const hex = candidate.replace(/[^a-fA-F0-9]/g, '');
      if (hex.length !== expectedHex.length) continue;
      try {
        const sigBuf = Buffer.from(hex, 'hex');
        if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
          return true;
        }
      } catch {
        /* invalid hex */
      }
    }
  }

  return false;
}

export function crowdedWebhookSkipSignatureVerify(): boolean {
  return process.env.CROWDED_WEBHOOK_SKIP_SIGNATURE_VERIFY === 'true';
}
