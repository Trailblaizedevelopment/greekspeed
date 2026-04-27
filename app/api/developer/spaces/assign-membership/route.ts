import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeveloperWithServiceClient } from '@/lib/api/requireDeveloperServiceClient';
import {
  syncProfileHomeFromPrimaryMembership,
  upsertSpaceMembership,
} from '@/lib/services/spaceMembershipService';

const bodySchema = z.object({
  user_id: z.string().uuid(),
  space_id: z.string().uuid(),
  role: z.enum(['active_member', 'alumni']).default('active_member'),
  is_primary: z.boolean().optional().default(false),
});

/**
 * TRA-665: Developer-only — upsert `space_memberships` for any user/space (service client).
 * POST /api/developer/spaces/assign-membership
 */
export async function POST(request: NextRequest) {
  const auth = await requireDeveloperWithServiceClient(request);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { user_id, space_id, role, is_primary } = parsed.data;
  const status = role === 'alumni' ? 'alumni' : 'active';

  const result = await upsertSpaceMembership(auth.service, {
    userId: user_id,
    spaceId: space_id,
    role,
    status,
    isPrimary: is_primary,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Membership upsert failed' }, { status: 500 });
  }

  let home_space:
    | {
        updated: true;
        previous_chapter_id: string | null;
        previous_chapter_label: string | null;
        new_chapter_id: string;
        new_chapter_label: string | null;
      }
    | { updated: false }
    | {
        updated: false;
        error: string;
        membership_saved: true;
      } = { updated: false };

  if (is_primary) {
    const home = await syncProfileHomeFromPrimaryMembership(auth.service, {
      userId: user_id,
      spaceId: space_id,
    });
    if (home.ok) {
      home_space = {
        updated: true,
        previous_chapter_id: home.previousChapterId,
        previous_chapter_label: home.previousChapterLabel,
        new_chapter_id: home.newChapterId,
        new_chapter_label: home.newChapterLabel,
      };
    } else {
      home_space = {
        updated: false,
        error: home.error,
        membership_saved: true,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    user_id,
    space_id,
    role,
    status,
    is_primary,
    home_space,
  });
}
