import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CrowdedAccount } from '@/types/crowded';
import {
  buildSyntheticCollectTransactionId,
  extractCrowdedPaymentTransactionIdFromPayload,
  mapCrowdedApiTransactionToUpsertRow,
  normalizeCrowdedTransactionListElement,
  pickCrowdedTransactionIdFromRecord,
  resolveCrowdedAccountIdForCollectEvent,
} from './crowdedTransactionMapping';

describe('normalizeCrowdedTransactionListElement', () => {
  it('merges attributes and top-level', () => {
    const out = normalizeCrowdedTransactionListElement({
      attributes: { amount: 100, id: 't1' },
      type: 'credit',
    });
    assert.equal(out.id, 't1');
    assert.equal(out.amount, 100);
    assert.equal(out.type, 'credit');
  });
});

describe('mapCrowdedApiTransactionToUpsertRow', () => {
  it('maps id and amount', () => {
    const row = mapCrowdedApiTransactionToUpsertRow(
      'chapter-uuid',
      'acc-1',
      { id: 'tx-99', amount: 5000, currency: 'USD', status: 'posted' },
      '2026-01-01T00:00:00.000Z'
    );
    assert.ok(row);
    assert.equal(row!.chapter_id, 'chapter-uuid');
    assert.equal(row!.crowded_account_id, 'acc-1');
    assert.equal(row!.crowded_transaction_id, 'tx-99');
    assert.equal(row!.amount_minor, 5000);
    assert.equal(row!.status, 'posted');
  });

  it('returns null without transaction id', () => {
    const row = mapCrowdedApiTransactionToUpsertRow(
      'chapter-uuid',
      'acc-1',
      { amount: 1 },
      '2026-01-01T00:00:00.000Z'
    );
    assert.equal(row, null);
  });
});

describe('buildSyntheticCollectTransactionId', () => {
  it('is stable for same inputs', () => {
    const a = buildSyntheticCollectTransactionId('c1', 'u1', 100, 'succeeded');
    const b = buildSyntheticCollectTransactionId('c1', 'u1', 100, 'succeeded');
    assert.equal(a, b);
    assert.ok(a.startsWith('collect:'));
  });

  it('differs by status', () => {
    const a = buildSyntheticCollectTransactionId('c1', 'u1', 100, 'succeeded');
    const b = buildSyntheticCollectTransactionId('c1', 'u1', 100, 'failed');
    assert.notEqual(a, b);
  });
});

describe('extractCrowdedPaymentTransactionIdFromPayload', () => {
  it('finds nested paymentId', () => {
    const id = extractCrowdedPaymentTransactionIdFromPayload({
      data: { paymentId: 'pay_123' },
    });
    assert.equal(id, 'pay_123');
  });
});

describe('resolveCrowdedAccountIdForCollectEvent', () => {
  it('uses payload account when provided', () => {
    const accounts: CrowdedAccount[] = [
      {
        id: 'a1',
        name: 'A',
        status: 'open',
        currency: 'USD',
        createdAt: 'x',
        contactId: 'c1',
      },
    ];
    const id = resolveCrowdedAccountIdForCollectEvent(accounts, 'c1', 'explicit');
    assert.equal(id, 'explicit');
  });

  it('matches contact wallet', () => {
    const accounts: CrowdedAccount[] = [
      {
        id: 'a1',
        name: 'Wallet',
        status: 'open',
        currency: 'USD',
        createdAt: 'x',
        contactId: 'c1',
      },
    ];
    const id = resolveCrowdedAccountIdForCollectEvent(accounts, 'c1', null);
    assert.equal(id, 'a1');
  });
});

describe('pickCrowdedTransactionIdFromRecord', () => {
  it('reads id (first matching key in order)', () => {
    assert.equal(pickCrowdedTransactionIdFromRecord({ id: 't1' }), 't1');
    assert.equal(pickCrowdedTransactionIdFromRecord({ transactionId: 't2' }), 't2');
  });
});
