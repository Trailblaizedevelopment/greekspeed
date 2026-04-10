import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolveDuesAssignmentCreateAmount } from './resolveDuesAssignmentCreateAmount';

describe('resolveDuesAssignmentCreateAmount', () => {
  it('uses zero for exempt', () => {
    const r = resolveDuesAssignmentCreateAmount({ base_amount: 500 }, { status: 'exempt' });
    assert.deepStrictEqual(r, { ok: true, effectiveAmount: 0, source: 'zero_status' });
  });

  it('uses cycle base for required without custom', () => {
    const r = resolveDuesAssignmentCreateAmount(
      { base_amount: 250 },
      { status: 'required', useCustomAmount: false }
    );
    assert.deepStrictEqual(r, { ok: true, effectiveAmount: 250, source: 'cycle' });
  });

  it('rejects required when base is zero', () => {
    const r = resolveDuesAssignmentCreateAmount(
      { base_amount: 0 },
      { status: 'required', useCustomAmount: false }
    );
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.strictEqual(r.httpStatus, 400);
  });

  it('accepts reduced under base', () => {
    const r = resolveDuesAssignmentCreateAmount(
      { base_amount: 100 },
      { status: 'reduced', useCustomAmount: true, customAmount: 50 }
    );
    assert.deepStrictEqual(r, { ok: true, effectiveAmount: 50, source: 'override' });
  });

  it('rejects reduced equal to base', () => {
    const r = resolveDuesAssignmentCreateAmount(
      { base_amount: 100 },
      { status: 'reduced', useCustomAmount: true, customAmount: 100 }
    );
    assert.strictEqual(r.ok, false);
  });

  it('rejects custom over 2x base for required', () => {
    const r = resolveDuesAssignmentCreateAmount(
      { base_amount: 100 },
      { status: 'required', useCustomAmount: true, customAmount: 201 }
    );
    assert.strictEqual(r.ok, false);
  });
});
