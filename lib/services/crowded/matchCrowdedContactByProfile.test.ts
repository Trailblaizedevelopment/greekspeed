import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  matchCrowdedContactForProfile,
  normalizeCrowdedPayEmail,
} from './matchCrowdedContactByProfile';
import type { CrowdedContact } from '../../../types/crowded';

function contact(partial: Partial<CrowdedContact> & Pick<CrowdedContact, 'id'>): CrowdedContact {
  return {
    chapterId: 'c1',
    firstName: 'A',
    lastName: 'B',
    status: 'active',
    createdAt: '2026-01-01',
    ...partial,
  };
}

describe('normalizeCrowdedPayEmail', () => {
  it('trims and lowercases', () => {
    assert.equal(normalizeCrowdedPayEmail('  X@Y.COM  '), 'x@y.com');
  });
});

describe('matchCrowdedContactForProfile', () => {
  it('returns no_profile_email when profile email missing', () => {
    const r = matchCrowdedContactForProfile([], {
      email: null,
      first_name: 'A',
      last_name: 'B',
      full_name: null,
    });
    assert.deepEqual(r, { ok: false, reason: 'no_profile_email' });
  });

  it('returns single email match', () => {
    const contacts = [
      contact({ id: 'u1', email: 'm@x.com', firstName: 'Sam', lastName: 'Lee' }),
    ];
    const r = matchCrowdedContactForProfile(contacts, {
      email: 'M@X.COM',
      first_name: 'Other',
      last_name: 'Name',
      full_name: null,
    });
    assert.deepEqual(r, { ok: true, contactId: 'u1' });
  });

  it('disambiguates by name when multiple emails match', () => {
    const contacts = [
      contact({ id: 'w1', email: 'a@b.com', firstName: 'Jane', lastName: 'Doe' }),
      contact({ id: 'w2', email: 'a@b.com', firstName: 'John', lastName: 'Doe' }),
    ];
    const r = matchCrowdedContactForProfile(contacts, {
      email: 'a@b.com',
      first_name: 'John',
      last_name: 'Doe',
      full_name: null,
    });
    assert.deepEqual(r, { ok: true, contactId: 'w2' });
  });

  it('returns ambiguous when multiple email matches and name does not narrow', () => {
    const contacts = [
      contact({ id: 'w1', email: 'a@b.com', firstName: 'Jane', lastName: 'Doe' }),
      contact({ id: 'w2', email: 'a@b.com', firstName: 'Janet', lastName: 'Doe' }),
    ];
    const r = matchCrowdedContactForProfile(contacts, {
      email: 'a@b.com',
      first_name: 'J',
      last_name: 'Doe',
      full_name: null,
    });
    assert.deepEqual(r, { ok: false, reason: 'ambiguous' });
  });
});
