import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeveloperWithServiceClient } from '@/lib/api/requireDeveloperServiceClient';
import { findOrCreateSpaceFromSimulationLabel } from '@/lib/services/spaceFromSimulationService';

const bodySchema = z.object({
  name: z.string().min(1).max(500),
  category: z.string().max(300).optional(),
});

/**
 * TRA-665: Developer-only — find space by exact display name or create simulation-style row.
 * POST /api/developer/spaces/ensure-reference
 * Authorization: Bearer <access_token>
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

  const result = await findOrCreateSpaceFromSimulationLabel(auth.service, {
    rawName: parsed.data.name,
    category: parsed.data.category,
    source: 'api_developer_spaces_ensure_reference',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    space_id: result.id,
    created: result.created,
  });
}
