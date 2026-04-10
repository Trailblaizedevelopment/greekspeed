import type { NextRequest } from 'next/server';

/** Best-effort client IP for Crowded `payerIp` and audit fields. */
export function clientIpFromRequest(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 100);
  }
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 100);
  return '0.0.0.0';
}
