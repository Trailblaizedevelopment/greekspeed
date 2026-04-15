import { NextRequest, NextResponse } from 'next/server';
import { authenticateCrowdedApiRequest } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { CrowdedApiError, createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { buildCrowdedDonationCollectionRequest } from '@/lib/services/donations/buildCrowdedDonationCollectionBody';
import { donationCampaignPostBodySchema } from '@/lib/services/donations/donationCampaignSchemas';
import type { DonationCampaign } from '@/types/donationCampaigns';

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

    const { data: rows, error } = await ctx.supabase
      .from('donation_campaigns')
      .select('*')
      .eq('chapter_id', trailblaizeChapterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('donation_campaigns list error:', error);
      return NextResponse.json({ error: 'Failed to list campaigns' }, { status: 500 });
    }

    return NextResponse.json({ data: (rows ?? []) as DonationCampaign[] });
  } catch (e) {
    console.error('GET donation campaigns:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trailblaizeChapterId } = await params;

    const auth = await authenticateCrowdedApiRequest(request);
    if (!auth?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const creatorId = auth.user.id;

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

    const parsed = donationCampaignPostBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;

    let crowdedBody;
    try {
      crowdedBody = buildCrowdedDonationCollectionRequest({
        kind: body.kind,
        title: body.title,
        requestedAmountCents: body.requestedAmountCents,
        goalAmountCents: body.goalAmountCents,
        showOnPublicFundraisingChannels: body.showOnPublicFundraisingChannels,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid campaign parameters';
      return NextResponse.json({ error: msg }, { status: 400 });
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

    let crowdedResult;
    try {
      crowdedResult = await crowdedClient.createCollection(ctx.crowdedChapterId, crowdedBody);
    } catch (err) {
      if (err instanceof CrowdedApiError) {
        console.error('Crowded createCollection failed:', {
          statusCode: err.statusCode,
          message: err.message,
          body: err.body,
        });
        return NextResponse.json(
          {
            error: err.message,
            code: err.type,
            details: err.details,
          },
          {
            status:
              err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502,
          }
        );
      }
      throw err;
    }

    const crowdedCollectionId = crowdedResult.data?.id?.trim();
    if (!crowdedCollectionId) {
      return NextResponse.json(
        { error: 'Crowded did not return a collection id' },
        { status: 502 }
      );
    }

    const shareFromCrowded = crowdedResult.data?.link?.trim();
    const crowdedShareUrl = shareFromCrowded || body.crowdedShareUrl?.trim() || null;

    const requestedAmountCents =
      body.kind === 'fixed' && body.requestedAmountCents != null ? body.requestedAmountCents : null;
    const goalAmountCents = body.goalAmountCents ?? null;

    const insertRow = {
      chapter_id: trailblaizeChapterId,
      title: body.title.trim(),
      kind: body.kind,
      crowded_collection_id: crowdedCollectionId,
      goal_amount_cents: goalAmountCents,
      requested_amount_cents: requestedAmountCents,
      crowded_share_url: crowdedShareUrl,
      metadata: ({
        ...(body.metadata ?? {}),
        ...(body.kind === 'fundraiser' && body.showOnPublicFundraisingChannels !== undefined
          ? { showOnPublicFundraisingChannels: body.showOnPublicFundraisingChannels }
          : {}),
      }) as Record<string, unknown>,
      created_by: creatorId,
    };

    const { data: row, error: insertErr } = await ctx.supabase
      .from('donation_campaigns')
      .insert(insertRow)
      .select('*')
      .single();

    if (insertErr) {
      const code = (insertErr as { code?: string }).code;
      if (code === '23505') {
        return NextResponse.json(
          { error: 'This Crowded collection is already linked to a campaign.', code: 'DUPLICATE_COLLECTION' },
          { status: 409 }
        );
      }
      if (code === '23514') {
        return NextResponse.json(
          {
            error:
              insertErr.message ??
              'Database rejected row (check donation_campaigns constraints — run latest migration for open/fundraiser kinds).',
            code: 'SCHEMA_CONSTRAINT',
          },
          { status: 400 }
        );
      }
      console.error('donation_campaigns insert error:', insertErr);
      return NextResponse.json(
        { error: 'Failed to save campaign after Crowded create', details: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: row as DonationCampaign }, { status: 201 });
  } catch (error) {
    if (error instanceof CrowdedApiError) {
      console.error('Crowded error (donation campaigns POST):', {
        statusCode: error.statusCode,
        message: error.message,
        body: error.body,
      });
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }
    console.error('POST donation campaigns:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
