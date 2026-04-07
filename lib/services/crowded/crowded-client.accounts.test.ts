/**
 * @see https://nodejs.org/api/test.html — run: npm run test:crowded:unit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CrowdedApiError,
  CROWDED_ERROR_DETAIL_NO_CUSTOMER,
  isCrowdedNoCustomerError,
} from './crowded-client';
import { mapCrowdedAccountToSyncFields } from './crowdedAccountMapping';

describe('CrowdedApiError / NO_CUSTOMER', () => {
  it('isCrowdedNoCustomerError is true when details include NO_CUSTOMER', () => {
    const err = new CrowdedApiError('No customer', {
      statusCode: 400,
      type: 'ResourceInputSafeError',
      details: [CROWDED_ERROR_DETAIL_NO_CUSTOMER],
    });
    assert.equal(isCrowdedNoCustomerError(err), true);
  });

  it('isCrowdedNoCustomerError is false for other errors', () => {
    assert.equal(isCrowdedNoCustomerError(new Error('nope')), false);
    assert.equal(
      isCrowdedNoCustomerError(
        new CrowdedApiError('other', { statusCode: 400, details: ['OTHER'] })
      ),
      false
    );
  });
});

describe('mapCrowdedAccountToSyncFields', () => {
  it('maps API fields to crowded_accounts columns', () => {
    const chapterId = '11111111-1111-1111-1111-111111111111';
    const row = mapCrowdedAccountToSyncFields(chapterId, {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Operating',
      status: 'active',
      currency: 'USD',
      balance: 100,
      hold: 0,
      available: 100,
      contactId: '33333333-3333-3333-3333-333333333333',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(row.chapter_id, chapterId);
    assert.equal(row.crowded_account_id, '22222222-2222-2222-2222-222222222222');
    assert.equal(row.display_name, 'Operating');
    assert.equal(row.balance_minor, 100);
    assert.equal(row.crowded_contact_id, '33333333-3333-3333-3333-333333333333');
  });
});
