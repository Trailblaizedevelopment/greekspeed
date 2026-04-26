import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runAlumniCurrentPlaceRepairBatch } from '@/lib/alumni/runAlumniCurrentPlaceRepairBatch';

/**
 * Scheduled repair: geocode `alumni.location` → `alumni.current_place` for rows still null
 * after data cleanup (Mapbox + service role). Only updates `current_place`.
 *
 * Auth (either):
 * - `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set, or
 * - `x-vercel-cron: 1` on Vercel Cron invocations.
 *
 * Configure in `vercel.json` `crons` + env `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
 * `NEXT_PUBLIC_SUPABASE_URL`, `MAPBOX_SECRET_ACCESS_TOKEN`.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  const bearer = cronSecret && auth === `Bearer ${cronSecret}`;
  const vercelCron = request.headers.get('x-vercel-cron') === '1';

  if (!bearer && !vercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mapboxToken = process.env.MAPBOX_SECRET_ACCESS_TOKEN;

  if (!supabaseUrl || !serviceKey || !mapboxToken) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const result = await runAlumniCurrentPlaceRepairBatch(supabase, mapboxToken);

  return NextResponse.json({
    ok: result.errors.length === 0,
    ...result,
  });
}
