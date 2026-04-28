import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DeveloperServiceAuthResult =
  | { ok: true; userId: string; service: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * Bearer JWT + `profiles.is_developer === true` + service-role Supabase client for server-side joins.
 * TRA-665: gates developer-only seed / space tooling APIs.
 */
export async function requireDeveloperWithServiceClient(
  request: NextRequest
): Promise<DeveloperServiceAuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }),
    };
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.replace('Bearer ', '');
  const authClient = createClient(url, anonKey);
  const {
    data: { user },
    error: authErr,
  } = await authClient.auth.getUser(token);
  if (authErr || !user?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const service = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('is_developer')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || profile?.is_developer !== true) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, service };
}
