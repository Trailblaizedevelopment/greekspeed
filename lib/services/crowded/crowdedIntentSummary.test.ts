/**
 * @see https://nodejs.org/api/test.html — run: npm run test:crowded:unit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeCrowdedCollectIntentSummary, pickLatestCrowdedIntentPerContact } from './crowdedIntentSummary';

describe('normalizeCrowdedCollectIntentSummary', () => {
  it('maps snake_case and optional paymentUrl', () => {
    const n = normalizeCrowdedCollectIntentSummary({
      id: 'e2e1a7c2-a9cc-4759-b9d8-079b5227e024',
      contact_id: '11111111-1111-1111-1111-111111111111',
      requested_amount: 100,
      paid_amount: 0,
      status: 'Not Paid',
      created_at: '2026-01-02T00:00:00.000Z',
    });
    assert.ok(n);
    assert.equal(n.contactId, '11111111-1111-1111-1111-111111111111');
    assert.equal(n.requestedAmount, 100);
    assert.equal(n.paymentUrl, null);
  });

  it('returns null without id or contactId', () => {
    assert.equal(normalizeCrowdedCollectIntentSummary({}), null);
  });
});

describe('pickLatestCrowdedIntentPerContact', () => {
  it('keeps newest per contactId', () => {
    const map = pickLatestCrowdedIntentPerContact([
      {
        id: 'a',
        contactId: 'c1',
        status: 'old',
        requestedAmount: 1,
        paidAmount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        contactId: 'c1',
        status: 'new',
        requestedAmount: 2,
        paidAmount: 0,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    assert.equal(map.get('c1')?.status, 'new');
  });
});
