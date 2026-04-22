import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { MessagingInboxPreview } from '@/types/messagingInbox';
import { getHiddenUserIdsForViewer } from '@/lib/services/userBlockService';

export const maxDuration = 60;

/**
 * Single endpoint for the messages UI: accepted connections plus last-message
 * previews and unread counts, sorted by most recent activity (latest message or
 * connection updated_at). Avoids client-side N+1 fetches and list reorder blink.
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 });
    }

    const userId = user.id;

    const { data: rawConnections, error: connError } = await supabase
      .from('connections')
      .select(
        `
        *,
        requester:profiles!requester_id(
          id,
          full_name,
          first_name,
          last_name,
          chapter,
          avatar_url,
          email
        ),
        recipient:profiles!recipient_id(
          id,
          full_name,
          first_name,
          last_name,
          chapter,
          avatar_url,
          email
        )
      `,
      )
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

    if (connError) {
      console.error('Inbox connection fetch error:', connError);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    const connections = rawConnections ?? [];
    const accepted = connections.filter((c) => c.status === 'accepted');

    const hiddenUserIds = await getHiddenUserIdsForViewer(supabase, userId);
    const hiddenSet = new Set(hiddenUserIds);
    const acceptedVisible = accepted.filter((c) => {
      const otherId =
        c.requester_id === userId ? (c.recipient_id as string) : (c.requester_id as string);
      return !hiddenSet.has(otherId);
    });

    const previews: Record<string, MessagingInboxPreview> = {};

    const metaRows = await Promise.all(
      acceptedVisible.map(async (conn) => {
        const connectionId = conn.id as string;

        const [lastRes, unreadCountRes] = await Promise.all([
          supabase
            .from('messages')
            .select('content, created_at, sender_id')
            .eq('connection_id', connectionId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('connection_id', connectionId)
            .neq('sender_id', userId)
            .is('read_at', null),
        ]);

        const last = lastRes.data;
        const unreadCount = unreadCountRes.count ?? 0;

        if (last?.created_at && last.sender_id !== undefined) {
          previews[connectionId] = {
            content: last.content ?? '',
            createdAt: last.created_at,
            senderId: last.sender_id,
            unreadCount,
          };
        }

        return {
          connectionId,
          lastAt: last?.created_at
            ? new Date(last.created_at).getTime()
            : new Date((conn.updated_at as string) || (conn.created_at as string)).getTime(),
        };
      }),
    );

    const lastAtById = new Map(metaRows.map((r) => [r.connectionId, r.lastAt]));
    const sorted = [...acceptedVisible].sort(
      (a, b) => (lastAtById.get(b.id) ?? 0) - (lastAtById.get(a.id) ?? 0),
    );

    return NextResponse.json({
      connections: sorted,
      previews,
    });
  } catch (error) {
    console.error('Inbox API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
