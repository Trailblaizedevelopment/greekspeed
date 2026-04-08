/**
 * @see https://nodejs.org/api/test.html — run: npm run test:crowded:unit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CrowdedApiError,
  CROWDED_ERROR_DETAIL_NO_CUSTOMER,
  isCrowdedNoCustomerError,
  normalizeCrowdedErrorDetails,
  unwrapCrowdedAccountsListPayload,
} from './crowded-client';
import {
  mapCrowdedAccountToSyncFields,
  normalizeCrowdedAccountListElement,
  resolveCrowdedAccountApiId,
} from './crowdedAccountMapping';

describe('CrowdedApiError / NO_CUSTOMER', () => {
  it('isCrowdedNoCustomerError is true when details include NO_CUSTOMER', () => {
    const err = new CrowdedApiError('No customer', {
      statusCode: 400,
      type: 'ResourceInputSafeError',
      details: [CROWDED_ERROR_DETAIL_NO_CUSTOMER],
    });
    assert.equal(isCrowdedNoCustomerError(err), true);
  });

  it('isCrowdedNoCustomerError is true when API sends details as a single string', () => {
    const err = new CrowdedApiError('No customer', {
      statusCode: 400,
      details: CROWDED_ERROR_DETAIL_NO_CUSTOMER,
    });
    assert.equal(isCrowdedNoCustomerError(err), true);
  });

  it('hasDetail does not throw when details is an object (unrecognized shape)', () => {
    const err = new CrowdedApiError('Forbidden', {
      statusCode: 403,
      details: { foo: 'bar' },
    });
    assert.equal(err.hasDetail(CROWDED_ERROR_DETAIL_NO_CUSTOMER), false);
    assert.equal(isCrowdedNoCustomerError(err), false);
  });

  it('normalizeCrowdedErrorDetails coerces string and arrays', () => {
    assert.deepEqual(normalizeCrowdedErrorDetails('NO_CUSTOMER'), ['NO_CUSTOMER']);
    assert.deepEqual(normalizeCrowdedErrorDetails([' A ', 'B']), ['A', 'B']);
    assert.equal(normalizeCrowdedErrorDetails({ code: 'X' })?.[0], 'X');
    assert.equal(normalizeCrowdedErrorDetails(undefined), undefined);
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

describe('unwrapCrowdedAccountsListPayload', () => {
  it('flattens Crowded list wrapper { data: { data, meta } }', () => {
    const inner = {
      data: [
        {
          id: '12832675',
          name: 'Trailblaize',
          status: 'Open',
          currency: 'USD',
          createdAt: '2026-04-07T00:18:30.265Z',
        },
      ],
      meta: {
        pagination: {
          total: 1,
          limit: 10,
          offset: 0,
          sort: 'createdAt',
          order: 'desc',
        },
      },
    };
    const raw = { data: inner };
    const out = unwrapCrowdedAccountsListPayload(raw) as {
      data: unknown[];
      meta: typeof inner.meta;
    };
    assert.equal(out.data.length, 1);
    assert.equal((out.data[0] as { id: string }).id, '12832675');
    assert.equal(out.meta.pagination.total, 1);
  });

  it('passes through standard { data: [], meta }', () => {
    const raw = {
      data: [{ id: 'a', name: 'n', status: 's', currency: 'USD', createdAt: 't' }],
      meta: {
        pagination: { total: 1, limit: 10, offset: 0, sort: 'x', order: 'desc' },
      },
    };
    const out = unwrapCrowdedAccountsListPayload(raw);
    assert.deepEqual(out, raw);
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

  it('maps accountId when Crowded omits id (list payload shape)', () => {
    const chapterId = '11111111-1111-1111-1111-111111111111';
    const row = mapCrowdedAccountToSyncFields(chapterId, {
      accountId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'Primary',
      status: 'active',
      currency: 'USD',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(row.crowded_account_id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('resolveCrowdedAccountApiId prefers id over accountId', () => {
    assert.equal(
      resolveCrowdedAccountApiId({
        id: '11111111-1111-1111-1111-111111111111',
        accountId: '22222222-2222-2222-2222-222222222222',
        name: 'x',
        status: 's',
        currency: 'USD',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      '11111111-1111-1111-1111-111111111111'
    );
  });

  it('maps numeric string id from Crowded (non-UUID)', () => {
    const chapterId = '11111111-1111-1111-1111-111111111111';
    const row = mapCrowdedAccountToSyncFields(chapterId, {
      id: '12832675',
      name: 'Trailblaize',
      status: 'Open',
      currency: 'USD',
      createdAt: '2026-04-07T00:18:30.265Z',
    });
    assert.equal(row.crowded_account_id, '12832675');
  });

  it('maps uuid when Crowded omits id and accountId', () => {
    const chapterId = '11111111-1111-1111-1111-111111111111';
    const row = mapCrowdedAccountToSyncFields(chapterId, {
      uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'Reserve',
      status: 'active',
      currency: 'USD',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(row.crowded_account_id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  });

  it('normalizeCrowdedAccountListElement merges JSON:API id + attributes', () => {
    const id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const flat = normalizeCrowdedAccountListElement({
      type: 'Account',
      id,
      attributes: {
        name: 'Operating',
        status: 'active',
        currency: 'USD',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(resolveCrowdedAccountApiId(flat), id);
    assert.equal(flat.name, 'Operating');
  });

  it('normalizeCrowdedAccountListElement flattens nested account + ledgerAccountId', () => {
    const id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const flat = normalizeCrowdedAccountListElement({
      account: {
        ledgerAccountId: id,
        name: 'Nested',
        status: 'active',
        currency: 'USD',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(resolveCrowdedAccountApiId(flat), id);
    assert.equal(flat.name, 'Nested');
  });
});
