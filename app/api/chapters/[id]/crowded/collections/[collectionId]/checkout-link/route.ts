import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CrowdedApiError,
  createCrowdedClientFromEnv,
  isCrowdedDebugCheckoutLinkEnabled,
} from '@/lib/services/crowded/crowded-client';
import { resolveCrowdedChapterApiContext } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import {
  checkCrowdedDuesPaymentIntentReadiness,
  createCrowdedDuesPaymentIntent,
} from '@/lib/services/dues/crowdedDuesPaymentIntent';
import { dollarsOutstandingToCents } from '@/lib/services/dues/duesOutstandingCents';
import { isFeatureEnabled } from '@/types/featureFlags';
import { clientIpFromRequest } from '@/lib/utils/clientIpFromRequest';
import { getBaseUrl } from '@/lib/utils/urlUtils';

const bodySchema = z.object({
  duesAssignmentId: z.string().uuid(),
});

const NON_PAYABLE_STATUSES = new Set(['paid', 'exempt', 'waived']);

/**
 * Treasurer: create a Crowded collect intent (checkout URL) for a member’s dues assignment on this collection.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collectionId: string }> }
) {
  try {
    const { id: trailblaizeChapterId, collectionId } = await params;
    const collectionIdTrim = collectionId?.trim();
    if (!collectionIdTrim) {
      return NextResponse.json({ error: 'Missing collection id' }, { status: 400 });
    }

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

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data: assignment, error: assignError } = await ctx.supabase
      .from('dues_assignments')
      .select(
        `
        id,
        user_id,
        status,
        amount_due,
        amount_paid,
        cycle:dues_cycles!dues_assignments_dues_cycle_id_fkey (
          id,
          chapter_id,
          crowded_collection_id
        )
      `
      )
      .eq('id', parsed.data.duesAssignmentId)
      .maybeSingle();

    if (assignError || !assignment) {
      return NextResponse.json({ error: 'Dues assignment not found' }, { status: 404 });
    }

    const cycleRaw = assignment.cycle;
    const cycle = (Array.isArray(cycleRaw) ? cycleRaw[0] : cycleRaw) as {
      id: string;
      chapter_id: string;
      crowded_collection_id: string | null;
    } | null;

    if (!cycle?.chapter_id) {
      return NextResponse.json({ error: 'Dues cycle not found' }, { status: 404 });
    }

    if (cycle.chapter_id.trim() !== trailblaizeChapterId.trim()) {
      return NextResponse.json({ error: 'Assignment does not belong to this chapter.' }, { status: 403 });
    }

    const linkedId = (cycle.crowded_collection_id as string | null)?.trim() ?? '';
    if (linkedId !== collectionIdTrim) {
      return NextResponse.json(
        { error: 'This assignment’s cycle is not linked to this Crowded collection.' },
        { status: 409 }
      );
    }

    const status = typeof assignment.status === 'string' ? assignment.status : '';
    if (NON_PAYABLE_STATUSES.has(status)) {
      return NextResponse.json({ error: 'This assignment is not payable online.' }, { status: 409 });
    }

    const requestedAmount = dollarsOutstandingToCents(assignment.amount_due, assignment.amount_paid);
    if (requestedAmount == null) {
      return NextResponse.json({ error: 'No outstanding balance for this assignment.' }, { status: 409 });
    }

    const { data: chapter, error: chapterError } = await ctx.supabase
      .from('chapters')
      .select('id, feature_flags, crowded_chapter_id')
      .eq('id', cycle.chapter_id)
      .maybeSingle();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const crowdedEnabled = isFeatureEnabled(chapter.feature_flags, 'crowded_integration_enabled');
    const crowdedChapterId = (chapter.crowded_chapter_id as string | null)?.trim() ?? '';
    if (!crowdedEnabled || !crowdedChapterId) {
      return NextResponse.json(
        { error: 'Crowded checkout is not available for this chapter.' },
        { status: 503 }
      );
    }

    const { data: memberProfile, error: profErr } = await ctx.supabase
      .from('profiles')
      .select('id, email, first_name, last_name, full_name')
      .eq('id', assignment.user_id)
      .maybeSingle();

    if (profErr || !memberProfile) {
      return NextResponse.json({ error: 'Member profile not found' }, { status: 404 });
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

    const dbg = isCrowdedDebugCheckoutLinkEnabled();
    const payerIp = clientIpFromRequest(request);
    const baseUrl = getBaseUrl().replace(/\/$/, '');
    const successUrl = `${baseUrl}/dashboard/dues?success=true`;
    const failureUrl = `${baseUrl}/dashboard/dues?canceled=true`;

    if (dbg) {
      console.info('[CROWDED_DEBUG_CHECKOUT_LINK] start', {
        trailblaizeChapterId,
        collectionIdTrim,
        duesAssignmentId: parsed.data.duesAssignmentId,
        duesCycleId: cycle.id,
        crowdedChapterId,
        assignmentUserId: assignment.user_id,
        memberProfileId: memberProfile.id,
        requestedAmountMinor: requestedAmount,
        assignmentStatus: status,
        payerIp,
        successUrl,
        failureUrl,
      });
    }

    if (dbg) {
      console.info('[CROWDED_DEBUG_CHECKOUT_LINK] calling listContacts', { crowdedChapterId });
    }
    const contactsResponse = await crowdedClient.listContacts(crowdedChapterId);
    if (dbg) {
      console.info('[CROWDED_DEBUG_CHECKOUT_LINK] listContacts ok', {
        contactCount: contactsResponse.data.length,
      });
    }

    const memberProfilePayload = {
      email: memberProfile.email,
      first_name: memberProfile.first_name,
      last_name: memberProfile.last_name,
      full_name: memberProfile.full_name,
    };
    const noProfileEmailMessage =
      'This member has no email on their profile. Add an email before generating a Crowded checkout link.';
    if (dbg) {
      const readiness = checkCrowdedDuesPaymentIntentReadiness({
        contacts: contactsResponse.data,
        memberProfile: memberProfilePayload,
        noProfileEmailMessage,
      });
      if (readiness.ok) {
        console.info('[CROWDED_DEBUG_CHECKOUT_LINK] contact readiness', {
          ok: true,
          contactId: readiness.contactId,
        });
      } else {
        console.info('[CROWDED_DEBUG_CHECKOUT_LINK] contact readiness', {
          ok: false,
          httpStatus: readiness.httpStatus,
          code: readiness.code,
          error: readiness.error,
        });
      }
    }

    if (dbg) {
      console.info('[CROWDED_DEBUG_CHECKOUT_LINK] calling createCrowdedDuesPaymentIntent', {
        crowdedChapterId,
        crowdedCollectionId: collectionIdTrim,
        requestedAmountMinor: requestedAmount,
        payerIp,
      });
    }

    const payIntent = await createCrowdedDuesPaymentIntent({
      crowded: crowdedClient,
      crowdedChapterId,
      crowdedCollectionId: collectionIdTrim,
      contacts: contactsResponse.data,
      memberProfile: memberProfilePayload,
      requestedAmountMinor: requestedAmount,
      payerIp,
      successUrl,
      failureUrl,
      noProfileEmailMessage,
    });

    if (dbg && payIntent.ok) {
      console.info('[CROWDED_DEBUG_CHECKOUT_LINK] createCrowdedDuesPaymentIntent ok');
    }

    if (!payIntent.ok) {
      if (dbg) {
        console.info('[CROWDED_DEBUG_CHECKOUT_LINK] createCrowdedDuesPaymentIntent returned ok:false', {
          httpStatus: payIntent.httpStatus,
          code: payIntent.code,
          error: payIntent.error,
        });
      }
      return NextResponse.json(
        { error: payIntent.error, ...(payIntent.code ? { code: payIntent.code } : {}) },
        { status: payIntent.httpStatus }
      );
    }

    return NextResponse.json({
      paymentUrl: payIntent.paymentUrl,
      provider: 'crowded' as const,
      duesAssignmentId: assignment.id,
      duesCycleId: cycle.id,
    });
  } catch (error) {
    if (error instanceof CrowdedApiError) {
      if (isCrowdedDebugCheckoutLinkEnabled()) {
        console.error('[CROWDED_DEBUG_CHECKOUT_LINK] CrowdedApiError', {
          message: error.message,
          statusCode: error.statusCode,
          type: error.type,
          requestId: error.requestId,
          details: error.details,
          bodyKeys:
            error.body && typeof error.body === 'object'
              ? Object.keys(error.body as Record<string, unknown>)
              : undefined,
        });
      }
      return NextResponse.json(
        { error: error.message, code: 'CROWDED_API_ERROR' },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }
    console.error('Crowded checkout-link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
