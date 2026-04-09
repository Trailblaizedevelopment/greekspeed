import assert from 'node:assert';
import { createHmac } from 'crypto';
import { describe, it } from 'node:test';
import { verifyCrowdedWebhookSignature } from './crowdedWebhookSignature';

describe('verifyCrowdedWebhookSignature', () => {
  it('accepts raw hex in x-crowded-signature', () => {
    const body = '{"hello":"world"}';
    const secret = 'test-secret';
    const hex = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const headers = new Headers({ 'x-crowded-signature': hex });
    assert.strictEqual(verifyCrowdedWebhookSignature(body, headers, secret), true);
  });

  it('accepts sha256= prefix', () => {
    const body = '{}';
    const secret = 's';
    const hex = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const headers = new Headers({ 'x-crowded-signature': `sha256=${hex}` });
    assert.strictEqual(verifyCrowdedWebhookSignature(body, headers, secret), true);
  });

  it('rejects wrong secret', () => {
    const body = '{}';
    const hex = createHmac('sha256', 'a').update(body, 'utf8').digest('hex');
    const headers = new Headers({ 'x-crowded-signature': hex });
    assert.strictEqual(verifyCrowdedWebhookSignature(body, headers, 'b'), false);
  });
});
