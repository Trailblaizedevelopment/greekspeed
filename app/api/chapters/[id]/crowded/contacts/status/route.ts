import { NextRequest, NextResponse } from 'next/server';
import { createCrowdedClientFromEnv, CrowdedApiError } from '@/lib/services/crowded/crowded-client';
import {
  matchCrowdedContactForProfile,
  type MatchCrowdedContactResult,
} from '@/lib/services/crowded/matchCrowdedContactByProfile';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';

const CONTACT_PAGE_SIZE = 100;

type CrowdedContactStatus = 'matched' | Exclude<MatchCrowdedContactResult, { ok: true }>['reason'];

async function listAllCrowdedContacts(
  crowded: ReturnType<typeof createCrowdedClientFromEnv>,
  crowdedChapterId: string
) {
  const contacts: Awaited<ReturnType<typeof crowded.listContacts>>['data'] = [];
  let offset = 0;

  while (true) {
    const response = await crowded.listContacts(crowdedChapterId, {
      limit: CONTACT_PAGE_SIZE,
      offset,
    });
    contacts.push(...response.data);
    if (response.data.length === 0) break;

    const total = response.meta?.pagination?.total;
    if (typeof total === 'number' && contacts.length >= total) break;
    if (response.data.length < CONTACT_PAGE_SIZE) break;
    offset += CONTACT_PAGE_SIZE;
  }

  return contacts;
}

/**
 * GET — preload per-member Crowded contact match status for the chapter members table.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trailblaizeChapterId } = await params;
    const ctx = await resolveCrowdedChapterApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    let crowdedClient;
    try {
      crowdedClient = createCrowdedClientFromEnv();
    } catch (error) {
      console.error('Crowded client config error:', error);
      return NextResponse.json(
        { error: 'Crowded API is not configured on the server' },
        { status: 503 }
      );
    }

    const contacts = await listAllCrowdedContacts(crowdedClient, ctx.crowdedChapterId);

    const { data: members, error: membersError } = await ctx.supabase
      .from('profiles')
      .select('id, email, first_name, last_name, full_name')
      .eq('chapter_id', trailblaizeChapterId)
      .in('role', ['admin', 'active_member'])
      .order('full_name');

    if (membersError) {
      return NextResponse.json(
        { error: membersError.message || 'Failed to load chapter members' },
        { status: 500 }
      );
    }

    const result = (members ?? []).map((member) => {
      const match = matchCrowdedContactForProfile(contacts, {
        email: member.email as string | null,
        first_name: member.first_name as string | null,
        last_name: member.last_name as string | null,
        full_name: member.full_name as string | null,
      });

      if (match.ok) {
        return {
          memberId: member.id as string,
          status: 'matched' as const,
          contactId: match.contactId,
        };
      }

      return {
        memberId: member.id as string,
        status: match.reason as CrowdedContactStatus,
      };
    });

    return NextResponse.json({ ok: true, members: result });
  } catch (error) {
    if (error instanceof CrowdedApiError) {
      return NextResponse.json(
        { error: error.message, code: 'CROWDED_API_ERROR' },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }

    console.error('Crowded contact status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
