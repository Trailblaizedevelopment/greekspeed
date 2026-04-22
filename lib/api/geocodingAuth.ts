import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

/**
 * Resolves the signed-in user for geocoding routes (Bearer JWT or Supabase cookies).
 */
export async function getAuthenticatedUserIdForGeocoding(
  request: NextRequest,
  supabaseUrl: string,
  supabaseAnonKey: string,
  serviceRoleKey: string
): Promise<string | null> {
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) {
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data.user) return data.user.id;
    }
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    });
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) return data.user.id;
  } catch {
    /* ignore */
  }

  return null;
}
