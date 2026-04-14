import type { CrowdedClient } from '@/lib/services/crowded/crowded-client';
import { CrowdedApiError, getCrowdedIntentPaymentUrl } from '@/lib/services/crowded/crowded-client';
import { crowdedContactMobileLooksLikeInvalidPlaceholder } from '@/lib/services/crowded/crowdedContactPhoneEligibility';
import {
  matchCrowdedContactForProfile,
  type CrowdedPayProfileForContactMatch,
} from '@/lib/services/crowded/matchCrowdedContactByProfile';
import type { CrowdedContact } from '@/types/crowded';

export type CrowdedDuesPaymentIntentErrorCode =
  | 'CROWDED_CONTACT_NOT_FOUND'
  | 'CROWDED_CONTACT_AMBIGUOUS'
  | 'CROWDED_CONTACT_PHONE_INVALID'
  | 'CROWDED_INTENT_REJECTED'
  | 'CROWDED_NO_PAYMENT_URL';

export type CrowdedDuesPaymentIntentReadinessResult =
  | { ok: true; contactId: string }
  | { ok: false; error: string; code?: CrowdedDuesPaymentIntentErrorCode; httpStatus: number };

function resolveCrowdedDuesPaymentContact(params: {
  contacts: CrowdedContact[];
  memberProfile: CrowdedPayProfileForContactMatch;
  noProfileEmailMessage?: string;
}): CrowdedDuesPaymentIntentReadinessResult {
  const match = matchCrowdedContactForProfile(params.contacts, params.memberProfile);
  if (!match.ok) {
    if (match.reason === 'no_profile_email') {
      return {
        ok: false,
        error:
          params.noProfileEmailMessage?.trim() ||
          'Add an email to your profile to pay dues online.',
        httpStatus: 400,
      };
    }
    if (match.reason === 'no_match') {
      return {
        ok: false,
        error:
          'No Crowded contact matches this member’s email. Add them as a contact in Crowded or fix their profile email.',
        code: 'CROWDED_CONTACT_NOT_FOUND',
        httpStatus: 404,
      };
    }
    return {
      ok: false,
      error: 'Multiple Crowded contacts match this email. Resolve duplicates in Crowded.',
      code: 'CROWDED_CONTACT_AMBIGUOUS',
      httpStatus: 409,
    };
  }

  return { ok: true, contactId: match.contactId };
}

export function checkCrowdedDuesPaymentIntentReadiness(params: {
  contacts: CrowdedContact[];
  memberProfile: CrowdedPayProfileForContactMatch;
  noProfileEmailMessage?: string;
}): CrowdedDuesPaymentIntentReadinessResult {
  return resolveCrowdedDuesPaymentContact(params);
}

/**
 * Create a Crowded collect intent for a member profile + outstanding balance (minor units).
 * Shared by member self-serve pay and treasurer-generated checkout links.
 */
export async function createCrowdedDuesPaymentIntent(params: {
  crowded: CrowdedClient;
  crowdedChapterId: string;
  crowdedCollectionId: string;
  contacts: CrowdedContact[];
  memberProfile: CrowdedPayProfileForContactMatch;
  requestedAmountMinor: number;
  payerIp: string;
  successUrl: string;
  failureUrl: string;
  /** Defaults to member self-serve copy. */
  noProfileEmailMessage?: string;
}): Promise<
  | { ok: true; paymentUrl: string }
  | { ok: false; error: string; code?: CrowdedDuesPaymentIntentErrorCode; httpStatus: number }
> {
  const readiness = resolveCrowdedDuesPaymentContact({
    contacts: params.contacts,
    memberProfile: params.memberProfile,
    noProfileEmailMessage: params.noProfileEmailMessage,
  });

  if (!readiness.ok) {
    return readiness;
  }

  const matchedContact = params.contacts.find((c) => c.id === readiness.contactId);
  if (
    matchedContact &&
    crowdedContactMobileLooksLikeInvalidPlaceholder(matchedContact.mobile)
  ) {
    return {
      ok: false,
      error:
        'This member’s Crowded contact has an invalid phone number. Use a real E.164 mobile in Trailblaize, run contact sync to Crowded, or fix the contact in Crowded (PATCH contact), then try the payment link again.',
      code: 'CROWDED_CONTACT_PHONE_INVALID',
      httpStatus: 409,
    };
  }

  let intentResult;
  try {
    intentResult = await params.crowded.createIntent(
      params.crowdedChapterId,
      params.crowdedCollectionId,
      {
        data: {
          contactId: readiness.contactId,
          requestedAmount: params.requestedAmountMinor,
          payerIp: params.payerIp,
          userConsented: true,
          successUrl: params.successUrl,
          failureUrl: params.failureUrl,
        },
      }
    );
  } catch (e) {
    if (e instanceof CrowdedApiError) {
      const unauthorized =
        e.type === 'UnauthorizedUser' ||
        (e.statusCode === 401 && e.message.toLowerCase().includes('forbidden'));
      if (unauthorized) {
        return {
          ok: false,
          error:
            'Crowded could not create a checkout link for this member (contact may be missing KYC fields such as a valid mobile). Update the member’s phone in Trailblaize and sync contacts, correct the contact in Crowded, or contact Crowded support with the request ID from server logs.',
          code: 'CROWDED_INTENT_REJECTED',
          httpStatus: 409,
        };
      }
    }
    throw e;
  }

  const paymentUrl = getCrowdedIntentPaymentUrl(intentResult);
  if (!paymentUrl) {
    return {
      ok: false,
      error: 'Crowded did not return a payment URL. Try again or contact support.',
      code: 'CROWDED_NO_PAYMENT_URL',
      httpStatus: 502,
    };
  }

  return { ok: true, paymentUrl };
}
