import { NextRequest, NextResponse } from 'next/server';
import { CrowdedApiError, createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import { crowdedCreateCollectIntentAppRequestSchema } from '@/lib/services/crowded/crowded-schemas';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collectionId: string }> }
) {
  try {
    const { id: trailblaizeChapterId, collectionId } = await params;

    const ctx = await resolveCrowdedChapterApiContext(request, trailblaizeChapterId);
    if (!ctx.ok) {
      return ctx.response;
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = crowdedCreateCollectIntentAppRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let crowdedClient;
    try {
      crowdedClient = createCrowdedClientFromEnv();
    } catch (e) {
      console.error('Crowded client config error:', e);
      return NextResponse.json(
        { error: 'Crowded API is not configured on the server' },
        { status: 503 }
      );
    }

    const result = await crowdedClient.createIntent(ctx.crowdedChapterId, collectionId, {
      data: {
        contactId: parsed.data.contactId,
        requestedAmount: parsed.data.requestedAmount,
        payerIp: parsed.data.payerIp,
        userConsented: parsed.data.userConsented,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrowdedApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }
    console.error('Crowded create intent error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
