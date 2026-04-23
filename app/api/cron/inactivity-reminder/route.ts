import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron endpoint: inactivity reminder — DISABLED (TRA-532)
 *
 * Activity-timestamp tracking (`last_active_at`) has been removed, so this
 * cron would incorrectly flag every user as inactive. Kept as a no-op until
 * a replacement engagement signal is defined.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({
    success: true,
    disabled: true,
    message: 'Inactivity reminders disabled — activity tracking removed (TRA-532)',
    sent: 0,
    smsSent: 0,
    skipped: 0,
    total: 0,
  });
}
