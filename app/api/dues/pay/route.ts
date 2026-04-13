import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CrowdedApiError, createCrowdedClientFromEnv } from '@/lib/services/crowded/crowded-client';
import { authenticateCrowdedApiRequest } from '@/lib/services/crowded/resolveCrowdedChapterApiContext';
import { maybeSyncCrowdedChapterContacts } from '@/lib/services/crowded/maybeSyncCrowdedChapterContacts';
import {
  checkCrowdedDuesPaymentIntentReadiness,
  createCrowdedDuesPaymentIntent,
} from '@/lib/services/dues/crowdedDuesPaymentIntent';
import { dollarsOutstandingToCents } from '@/lib/services/dues/duesOutstandingCents';
import { isFeatureEnabled } from '@/types/featureFlags';
import { clientIpFromRequest } from '@/lib/utils/clientIpFromRequest';
import { getBaseUrl } from '@/lib/utils/urlUtils';

const duesPayBodySchema = z.object({
  duesAssignmentId: z.string().uuid(),
  userConsented: z.literal(true).optional(),
  readinessOnly: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.readinessOnly === true) {
    return;
  }

  if (value.userConsented !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['userConsented'],
      message: 'userConsented must be true unless readinessOnly is set.',
    });
  }
});

const NON_PAYABLE_STATUSES = new Set(['paid', 'exempt', 'waived']);

/**
 * Member dues checkout: Crowded intent when chapter flag + `crowded_chapter_id` + `dues_cycles.crowded_collection_id` are set.
 * Stripe fallback is not implemented in-repo yet — returns 503 with `code` when Crowded path is unavailable.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateCrowdedApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, supabase } = auth;

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = duesPayBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const readinessOnly = parsed.data.readinessOnly === true;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, chapter_id, email, first_name, last_name, full_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (!profile.chapter_id?.trim()) {
      return NextResponse.json(
        { error: 'Your profile is not linked to a chapter for online dues payment.' },
        { status: 403 }
      );
    }

    const { data: assignment, error: assignError } = await supabase
      .from('dues_assignments')
      .select(
        `
        id,
        user_id,
        status,
        amount_due,
        amount_paid,
        dues_cycle_id,
        cycle:dues_cycles!dues_assignments_dues_cycle_id_fkey (
          id,
          chapter_id,
          crowded_collection_id,
          name
        )
      `
      )
      .eq('id', parsed.data.duesAssignmentId)
      .maybeSingle();

    if (assignError || !assignment) {
      return NextResponse.json({ error: 'Dues assignment not found' }, { status: 404 });
    }

    if (assignment.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const cycleRaw = assignment.cycle;
    const cycle = (Array.isArray(cycleRaw) ? cycleRaw[0] : cycleRaw) as {
      id: string;
      chapter_id: string;
      crowded_collection_id: string | null;
      name: string | null;
    } | null;

    if (!cycle?.chapter_id) {
      return NextResponse.json({ error: 'Dues cycle not found' }, { status: 404 });
    }

    if (profile.chapter_id.trim() !== cycle.chapter_id.trim()) {
      return NextResponse.json({ error: 'This dues assignment does not belong to your chapter.' }, { status: 403 });
    }

    const status = typeof assignment.status === 'string' ? assignment.status : '';
    if (NON_PAYABLE_STATUSES.has(status)) {
      return NextResponse.json(
        { error: 'This dues assignment is not payable online.', code: 'DUES_ASSIGNMENT_NOT_PAYABLE' },
        { status: 409 }
      );
    }

    const requestedAmount = dollarsOutstandingToCents(assignment.amount_due, assignment.amount_paid);
    if (requestedAmount == null) {
      return NextResponse.json(
        { error: 'No outstanding balance for this assignment.', code: 'NO_OUTSTANDING_BALANCE' },
        { status: 409 }
      );
    }

    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, feature_flags, crowded_chapter_id')
      .eq('id', cycle.chapter_id)
      .maybeSingle();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const crowdedEnabled = isFeatureEnabled(chapter.feature_flags, 'crowded_integration_enabled');
    const crowdedChapterId = (chapter.crowded_chapter_id as string | null)?.trim() ?? '';
    const crowdedCollectionId = (cycle.crowded_collection_id as string | null)?.trim() ?? '';

    if (!crowdedEnabled || crowdedChapterId.length === 0) {
      return NextResponse.json(
        {
          error:
            'Online dues checkout is not configured for your chapter. Contact your treasurer, or try again later.',
          code: 'CROWDED_CHAPTER_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    if (crowdedCollectionId.length === 0) {
      return NextResponse.json(
        {
          error:
            'This dues cycle is not linked to Crowded yet. Contact your treasurer to finish setup.',
          code: 'CROWDED_CYCLE_NOT_LINKED',
        },
        { status: 503 }
      );
    }

    if (!readinessOnly) {
      await maybeSyncCrowdedChapterContacts({
        supabase,
        trailblaizeChapterId: cycle.chapter_id.trim(),
        memberIds: [user.id],
      });
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

    const contactsResponse = await crowdedClient.listContacts(crowdedChapterId);

    const baseUrl = getBaseUrl().replace(/\/$/, '');
    const successUrl = `${baseUrl}/dashboard/dues?success=true`;
    const failureUrl = `${baseUrl}/dashboard/dues?canceled=true`;

    const readiness = checkCrowdedDuesPaymentIntentReadiness({
      contacts: contactsResponse.data,
      memberProfile: {
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        full_name: profile.full_name,
      },
    });

    if (!readiness.ok) {
      if (readiness.httpStatus === 400) {
        return NextResponse.json({ error: readiness.error }, { status: 400 });
      }
      return NextResponse.json(
        { error: readiness.error, ...(readiness.code ? { code: readiness.code } : {}) },
        { status: readiness.httpStatus }
      );
    }

    if (readinessOnly) {
      return NextResponse.json({
        ready: true,
        code: 'READY',
        duesAssignmentId: assignment.id,
        duesCycleId: cycle.id,
      });
    }

    const payIntent = await createCrowdedDuesPaymentIntent({
      crowded: crowdedClient,
      crowdedChapterId,
      crowdedCollectionId,
      contacts: contactsResponse.data,
      memberProfile: {
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        full_name: profile.full_name,
      },
      requestedAmountMinor: requestedAmount,
      payerIp: clientIpFromRequest(request),
      successUrl,
      failureUrl,
    });

    if (!payIntent.ok) {
      if (payIntent.httpStatus === 400) {
        return NextResponse.json({ error: payIntent.error }, { status: 400 });
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
      return NextResponse.json(
        { error: error.message, code: 'CROWDED_API_ERROR' },
        { status: error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502 }
      );
    }
    console.error('Dues pay error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
