import { supabase } from '@/lib/supabase/client';

export type AcceptInvitationAsSessionUserResult =
  | {
      ok: true;
      needs_approval: boolean;
      chapter_id?: string;
      chapter_name?: string;
    }
  | { ok: false; status: number; code?: string; error: string };

/**
 * POST /api/me/accept-invitation for the current browser session (second chapter / TRA-661).
 */
export async function acceptInvitationAsSessionUser(
  token: string
): Promise<AcceptInvitationAsSessionUserResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, status: 401, error: 'You must be signed in to accept this invitation.' };
  }

  const response = await fetch('/api/me/accept-invitation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ token }),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    success?: boolean;
    needs_approval?: boolean;
    chapter_id?: string;
    chapter_name?: string;
  };

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: json.code,
      error: typeof json.error === 'string' ? json.error : 'Could not accept invitation',
    };
  }

  return {
    ok: true,
    needs_approval: json.needs_approval === true,
    chapter_id: json.chapter_id,
    chapter_name: json.chapter_name,
  };
}
