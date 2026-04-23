import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/activity — DEPRECATED (TRA-532)
 *
 * Activity-timestamp tracking has been removed. This endpoint is kept as a
 * no-op so that any in-flight client calls (cached tabs, service workers)
 * receive a 200 instead of a 404 during the rollout window.
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Activity tracking disabled',
    deprecated: true,
  })
}
