/**
 * @see https://nodejs.org/api/test.html — run: npm run test:crowded:unit
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  buildCrowdedUrl,
  CrowdedApiError,
  CrowdedClient,
  getCrowdedIntentPaymentUrl,
} from './crowded-client';

describe('CrowdedClient.createCollection', () => {
  const originalFetch = globalThis.fetch;
  const chapterId = 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa';

  beforeEach(() => {
    delete process.env.CROWDED_VALIDATE_RESPONSES;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.CROWDED_VALIDATE_RESPONSES;
  });

  it('POSTs JSON to /api/v1/chapters/:id/collections', async () => {
    const expectedUrl = buildCrowdedUrl('https://crowded.test', `/chapters/${chapterId}/collections`);
    const payload = {
      data: { title: 'Dues fall 2026', requestedAmount: 50_000 },
    };
    const responseBody = {
      data: {
        id: '442650b1-05e2-4d33-8417-3df879ed0a2e',
        title: 'Dues fall 2026',
        requestedAmount: 50_000,
        goalAmount: null,
        createdAt: '2026-04-08T22:32:37.305Z',
      },
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), expectedUrl);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, JSON.stringify(payload));
      return new Response(JSON.stringify(responseBody), { status: 201 });
    }) as typeof fetch;

    const client = new CrowdedClient({ baseUrl: 'https://crowded.test', token: 't' });
    const out = await client.createCollection(chapterId, payload);
    assert.equal(out.data.id, '442650b1-05e2-4d33-8417-3df879ed0a2e');
    assert.equal(out.data.requestedAmount, 50_000);
  });
});

describe('CrowdedClient.getCollection', () => {
  const originalFetch = globalThis.fetch;
  const chapterId = 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa';
  const collectionId = '442650b1-05e2-4d33-8417-3df879ed0a2e';

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('GETs /api/v1/chapters/:id/collections/:collectionId', async () => {
    const expectedUrl = buildCrowdedUrl(
      'https://crowded.test',
      `/chapters/${chapterId}/collections/${collectionId}`
    );
    const responseBody = {
      data: {
        id: collectionId,
        title: 'Test',
        requestedAmount: 100,
        goalAmount: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), expectedUrl);
      assert.equal(init?.method, 'GET');
      return new Response(JSON.stringify(responseBody), { status: 200 });
    }) as typeof fetch;

    const client = new CrowdedClient({ baseUrl: 'https://crowded.test', token: 't' });
    const out = await client.getCollection(chapterId, collectionId);
    assert.equal(out.data.title, 'Test');
  });
});

describe('CrowdedClient.createIntent', () => {
  const originalFetch = globalThis.fetch;
  const chapterId = 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa';
  const collectionId = '442650b1-05e2-4d33-8417-3df879ed0a2e';
  const contactId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    delete process.env.CROWDED_VALIDATE_RESPONSES;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.CROWDED_VALIDATE_RESPONSES;
  });

  it('POSTs intent body with all fields under data', async () => {
    const expectedUrl = buildCrowdedUrl(
      'https://crowded.test',
      `/chapters/${chapterId}/collections/${collectionId}/intents`
    );
    const payload = {
      data: {
        contactId,
        requestedAmount: 50_000,
        payerIp: '203.0.113.1',
        userConsented: true,
      },
    };
    const paymentUrl = 'https://collect.example/pay?x=1';
    const responseBody = {
      data: {
        id: 'e2e1a7c2-a9cc-4759-b9d8-079b5227e024',
        contactId,
        requestedAmount: 50_000,
        paidAmount: 0,
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        status: 'Not Paid',
        payments: [],
        createdAt: '2026-04-08T22:44:13.891Z',
        successUrl: null,
        failureUrl: null,
        paymentUrl,
      },
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), expectedUrl);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, JSON.stringify(payload));
      return new Response(JSON.stringify(responseBody), { status: 200 });
    }) as typeof fetch;

    const client = new CrowdedClient({ baseUrl: 'https://crowded.test', token: 't' });
    const out = await client.createIntent(chapterId, collectionId, payload);
    assert.equal(getCrowdedIntentPaymentUrl(out), paymentUrl);
    assert.equal(out.data.status, 'Not Paid');
  });

  it('throws CrowdedApiError on validation errors from Crowded', async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          type: 'ValidationError',
          statusCode: 400,
          message: '"data" must be of type object',
        }),
        { status: 400 }
      );
    }) as typeof fetch;

    const client = new CrowdedClient({ baseUrl: 'https://crowded.test', token: 't' });
    await assert.rejects(
      () =>
        client.createIntent(chapterId, collectionId, {
          data: {
            contactId,
            requestedAmount: 1,
            payerIp: '1.1.1.1',
            userConsented: true,
          },
        }),
      (err: unknown) => {
        assert.ok(err instanceof CrowdedApiError);
        return true;
      }
    );
  });
});

describe('getCrowdedIntentPaymentUrl', () => {
  it('returns undefined when paymentUrl empty', () => {
    assert.equal(
      getCrowdedIntentPaymentUrl({
        data: {
          id: 'e2e1a7c2-a9cc-4759-b9d8-079b5227e024',
          contactId: '11111111-1111-1111-1111-111111111111',
          requestedAmount: 1,
          paidAmount: 0,
          status: 'x',
          payments: [],
          createdAt: 't',
          paymentUrl: '   ',
        },
      }),
      undefined
    );
  });
});
