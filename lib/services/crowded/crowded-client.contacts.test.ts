/**
 * @see https://nodejs.org/api/test.html — run: npm run test:crowded:unit
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildCrowdedUrl, CrowdedClient } from './crowded-client';

describe('CrowdedClient.bulkCreateContacts', () => {
  const originalFetch = globalThis.fetch;
  const chapterId = 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa';

  beforeEach(() => {
    delete process.env.CROWDED_VALIDATE_RESPONSES;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.CROWDED_VALIDATE_RESPONSES;
  });

  it('POSTs JSON to /api/v1/chapters/:id/contacts', async () => {
    const expectedUrl = buildCrowdedUrl('https://crowded.test', `/chapters/${chapterId}/contacts`);
    const payload = {
      data: [
        { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', mobile: '+15555550100' },
      ],
    };
    const responseBody = {
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          chapterId,
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          mobile: '+15555550100',
          status: 'active',
          createdAt: '2026-04-10T00:00:00.000Z',
        },
      ],
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), expectedUrl);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, JSON.stringify(payload));
      return new Response(JSON.stringify(responseBody), { status: 201 });
    }) as typeof fetch;

    const client = new CrowdedClient({ baseUrl: 'https://crowded.test', token: 't' });
    const out = await client.bulkCreateContacts(chapterId, payload);
    assert.equal(out.data?.length, 1);
    assert.equal(out.data?.[0]?.email, 'ada@example.com');
  });
});

describe('CrowdedClient.listContacts query', () => {
  const originalFetch = globalThis.fetch;
  const chapterId = 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa';

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('appends limit and offset when provided', async () => {
    const expectedUrl = buildCrowdedUrl(
      'https://crowded.test',
      `/chapters/${chapterId}/contacts?limit=10&offset=20`
    );
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), expectedUrl);
      assert.equal(init?.method, 'GET');
      return new Response(
        JSON.stringify({
          data: [],
          meta: {
            pagination: { total: 0, limit: 10, offset: 20, sort: 'createdAt', order: 'desc' },
          },
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const client = new CrowdedClient({ baseUrl: 'https://crowded.test', token: 't' });
    const out = await client.listContacts(chapterId, { limit: 10, offset: 20 });
    assert.equal(out.data.length, 0);
  });
});

describe('CrowdedClient.patchContact', () => {
  const originalFetch = globalThis.fetch;
  const chapterId = 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa';
  const contactId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('PATCHes JSON to /api/v1/chapters/:chapterId/contacts/:contactId', async () => {
    const expectedUrl = buildCrowdedUrl(
      'https://crowded.test',
      `/chapters/${chapterId}/contacts/${contactId}`
    );
    const payload = { data: { mobile: '+14105550100' } };
    const responseBody = {
      data: {
        id: contactId,
        chapterId,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        mobile: '+14105550100',
        status: 'active',
        createdAt: '2026-04-10T00:00:00.000Z',
      },
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), expectedUrl);
      assert.equal(init?.method, 'PATCH');
      assert.equal(init?.body, JSON.stringify(payload));
      return new Response(JSON.stringify(responseBody), { status: 200 });
    }) as typeof fetch;

    const client = new CrowdedClient({ baseUrl: 'https://crowded.test', token: 't' });
    const out = await client.patchContact(chapterId, contactId, payload);
    assert.equal(out.data.mobile, '+14105550100');
  });
});
