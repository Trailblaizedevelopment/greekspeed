/**
 * @see https://nodejs.org/api/test.html — run: npm run test:crowded:unit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeProfilePhoneForCrowded } from './syncChapterContactsToCrowded';

describe('normalizeProfilePhoneForCrowded', () => {
  it('formats 10-digit US numbers', () => {
    assert.equal(normalizeProfilePhoneForCrowded('4104599139'), '+14104599139');
  });

  it('passes through +… when digits are long enough (Crowded may normalize)', () => {
    assert.equal(normalizeProfilePhoneForCrowded('+44 20 7946 0958'), '+44 20 7946 0958');
  });

  it('returns undefined for empty', () => {
    assert.equal(normalizeProfilePhoneForCrowded(null), undefined);
    assert.equal(normalizeProfilePhoneForCrowded(''), undefined);
  });
});
