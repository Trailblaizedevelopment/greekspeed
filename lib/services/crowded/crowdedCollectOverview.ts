import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrowdedClient } from '@/lib/services/crowded/crowded-client';
import { CrowdedApiError } from '@/lib/services/crowded/crowded-client';
import { pickLatestCrowdedIntentPerContact } from '@/lib/services/crowded/crowdedIntentSummary';
import { matchCrowdedContactForProfile } from '@/lib/services/crowded/matchCrowdedContactByProfile';
import type {
  CrowdedCollectOverviewApiOk,
  CrowdedCollectOverviewRow,
} from '@/types/crowdedCollectOverview';
import type { CrowdedCollectIntentSummary } from '@/types/crowded';

function collectPublicBaseUrlFromEnv(): string | null {
  const u = process.env.CROWDED_COLLECT_UI_BASE_URL?.trim();
  return u && u.length > 0 ? u.replace(/\/+$/, '') : null;
}

export async function buildCrowdedCollectOverview(params: {
  supabase: SupabaseClient;
  crowded: CrowdedClient;
  trailblaizeChapterId: string;
  crowdedChapterId: string;
  collectionId: string;
}): Promise<CrowdedCollectOverviewApiOk> {
  const { supabase, crowded, trailblaizeChapterId, crowdedChapterId, collectionId } = params;

  const { data: cycle, error: cycleErr } = await supabase
    .from('dues_cycles')
    .select('id, name, chapter_id, crowded_collection_id')
    .eq('chapter_id', trailblaizeChapterId)
    .eq('crowded_collection_id', collectionId)
    .maybeSingle();

  if (cycleErr || !cycle?.id) {
    throw new Error('dues_cycle_not_found_for_collection');
  }

  let collectionFromCrowded: CrowdedCollectOverviewApiOk['data']['collectionFromCrowded'] = null;
  let collectionCrowdedError: string | null = null;
  try {
    const res = await crowded.getCollection(crowdedChapterId, collectionId);
    collectionFromCrowded = {
      id: res.data.id,
      title: res.data.title,
      requestedAmountMinor: res.data.requestedAmount,
      createdAt: res.data.createdAt,
    };
  } catch (e) {
    if (e instanceof CrowdedApiError) {
      collectionCrowdedError = e.message;
    } else {
      collectionCrowdedError = 'Could not load collection from Crowded.';
    }
  }

  let intentsListAvailable = true;
  let intentsCrowdedError: string | null = null;
  let intentByContact = new Map<string, CrowdedCollectIntentSummary>();
  try {
    const list = await crowded.listCollectionIntents(crowdedChapterId, collectionId);
    intentByContact = pickLatestCrowdedIntentPerContact(list.data);
  } catch (e) {
    if (e instanceof CrowdedApiError && e.statusCode === 404) {
      intentsListAvailable = false;
      intentByContact = new Map();
    } else if (e instanceof CrowdedApiError) {
      intentsListAvailable = false;
      intentsCrowdedError = e.message;
      intentByContact = new Map();
    } else {
      intentsListAvailable = false;
      intentsCrowdedError = 'Could not load intents from Crowded.';
      intentByContact = new Map();
    }
  }

  const { data: assignmentRows, error: assignErr } = await supabase
    .from('dues_assignments')
    .select(
      `
      id,
      user_id,
      status,
      amount_assessed,
      amount_due,
      amount_paid,
      user:profiles!dues_assignments_user_id_fkey(
        id,
        full_name,
        email,
        first_name,
        last_name,
        member_status
      )
    `
    )
    .eq('dues_cycle_id', cycle.id)
    .order('amount_due', { ascending: false });

  if (assignErr) {
    throw new Error(assignErr.message);
  }

  const contactsResponse = await crowded.listContacts(crowdedChapterId);
  const contacts = contactsResponse.data;

  const rows: CrowdedCollectOverviewRow[] = [];
  let trailblaizeTotalPaidUsd = 0;
  let trailblaizeTotalDueUsd = 0;
  let crowdedMatchedContacts = 0;
  let intentsWithCrowdedStatus = 0;

  for (const raw of assignmentRows ?? []) {
    const a = raw as {
      id: string;
      user_id: string;
      status: string;
      amount_assessed: number | string | null;
      amount_due: number | string | null;
      amount_paid: number | string | null;
      user: unknown;
    };
    const userRaw = a.user;
    const user = (Array.isArray(userRaw) ? userRaw[0] : userRaw) as {
      id: string;
      full_name: string | null;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      member_status: string | null;
    } | null;

    const amountAssessed = Number(a.amount_assessed);
    const amountDue = Number(a.amount_due);
    const amountPaid = Number(a.amount_paid);
    if (Number.isFinite(amountDue)) trailblaizeTotalDueUsd += amountDue;
    if (Number.isFinite(amountPaid)) trailblaizeTotalPaidUsd += amountPaid;

    const match = matchCrowdedContactForProfile(contacts, {
      email: user?.email ?? null,
      first_name: user?.first_name ?? null,
      last_name: user?.last_name ?? null,
      full_name: user?.full_name ?? null,
    });

    let crowdedContact: CrowdedCollectOverviewRow['crowdedContact'];
    if (match.ok) {
      crowdedContact = { state: 'matched', contactId: match.contactId };
      crowdedMatchedContacts += 1;
    } else {
      crowdedContact = { state: match.reason };
    }

    let crowdedIntent: CrowdedCollectOverviewRow['crowdedIntent'] = null;
    if (match.ok) {
      const intent = intentByContact.get(match.contactId);
      if (intent) {
        intentsWithCrowdedStatus += 1;
        crowdedIntent = {
          id: intent.id,
          status: intent.status,
          requestedAmountMinor: intent.requestedAmount,
          paidAmountMinor: intent.paidAmount,
          paymentUrl: intent.paymentUrl,
          createdAt: intent.createdAt,
        };
      }
    }

    rows.push({
      assignmentId: a.id,
      userId: a.user_id,
      fullName: user?.full_name ?? null,
      email: user?.email ?? null,
      memberStatus: user?.member_status ?? null,
      amountAssessed: Number.isFinite(amountAssessed) ? amountAssessed : 0,
      amountDue: Number.isFinite(amountDue) ? amountDue : 0,
      amountPaid: Number.isFinite(amountPaid) ? amountPaid : 0,
      trailblaizeStatus: typeof a.status === 'string' ? a.status : '',
      crowdedContact,
      crowdedIntent,
    });
  }

  return {
    ok: true,
    data: {
      duesCycleId: cycle.id,
      duesCycleName: typeof cycle.name === 'string' ? cycle.name : 'Dues',
      collectionId,
      collectionFromCrowded,
      collectionCrowdedError,
      intentsListAvailable,
      intentsCrowdedError,
      collectPublicBaseUrl: collectPublicBaseUrlFromEnv(),
      rows,
      summary: {
        assignmentCount: rows.length,
        trailblaizeTotalPaidUsd,
        trailblaizeTotalDueUsd,
        crowdedMatchedContacts,
        intentsWithCrowdedStatus,
      },
    },
  };
}
