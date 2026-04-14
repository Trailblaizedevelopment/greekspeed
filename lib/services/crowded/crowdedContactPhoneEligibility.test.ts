import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crowdedContactMobileLooksLikeInvalidPlaceholder } from './crowdedContactPhoneEligibility';

describe('crowdedContactMobileLooksLikeInvalidPlaceholder', () => {
  it('returns false for empty mobile', () => {
    assert.equal(crowdedContactMobileLooksLikeInvalidPlaceholder(undefined), false);
    assert.equal(crowdedContactMobileLooksLikeInvalidPlaceholder(''), false);
  });

  it('returns false for plausible E.164 US', () => {
    assert.equal(crowdedContactMobileLooksLikeInvalidPlaceholder('+14105550100'), false);
    assert.equal(crowdedContactMobileLooksLikeInvalidPlaceholder('+1 (410) 555-0100'), false);
  });

  it('flags UUID-shaped junk', () => {
    assert.equal(
      crowdedContactMobileLooksLikeInvalidPlaceholder(
        '+0-babcd00f-5400-471f-8e1b-4ba1299ef5f1'
      ),
      true
    );
  });

  it('flags +0 prefix', () => {
    assert.equal(crowdedContactMobileLooksLikeInvalidPlaceholder('+01234567890'), true);
  });

  it('flags non-E.164 letters', () => {
    assert.equal(crowdedContactMobileLooksLikeInvalidPlaceholder('+1-800-FLOWERS'), true);
  });
});
