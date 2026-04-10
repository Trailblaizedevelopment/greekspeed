/**
 * Resolves dues assignment dollar amounts for POST /api/dues/assignments.
 * Server is source of truth: default from cycle.base_amount unless exempt/waived/reduced/custom rules apply.
 */

export type DuesAssignmentAmountSource = 'cycle' | 'override' | 'zero_status';

export type ResolveDuesAssignmentCreateAmountResult =
  | { ok: true; effectiveAmount: number; source: DuesAssignmentAmountSource }
  | { ok: false; error: string; httpStatus: number };

export type ResolveDuesAssignmentCreateInput = {
  status?: string;
  useCustomAmount?: boolean;
  customAmount?: number;
};

const OVERRIDE_MAX_MULTIPLIER = 2;

export function resolveDuesAssignmentCreateAmount(
  cycle: { base_amount: unknown },
  input: ResolveDuesAssignmentCreateInput
): ResolveDuesAssignmentCreateAmountResult {
  const status = (input.status || 'required').trim();

  if (status === 'exempt' || status === 'waived') {
    return { ok: true, effectiveAmount: 0, source: 'zero_status' };
  }

  const baseNum = Number(cycle.base_amount);
  if (!Number.isFinite(baseNum) || baseNum < 0) {
    return {
      ok: false,
      error: 'Dues cycle has an invalid base amount.',
      httpStatus: 400,
    };
  }

  if (status === 'reduced') {
    if (input.useCustomAmount !== true) {
      return {
        ok: false,
        error:
          'Reduced status requires a custom amount less than the cycle base (set useCustomAmount to true).',
        httpStatus: 400,
      };
    }
    const c = input.customAmount;
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0 || c >= baseNum) {
      return {
        ok: false,
        error: 'Reduced dues must be greater than 0 and less than the cycle base amount.',
        httpStatus: 400,
      };
    }
    return { ok: true, effectiveAmount: c, source: 'override' };
  }

  // required, paid, etc.
  if (input.useCustomAmount === true) {
    const c = input.customAmount;
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) {
      return {
        ok: false,
        error: 'customAmount must be a positive number when useCustomAmount is true.',
        httpStatus: 400,
      };
    }
    const cap = baseNum * OVERRIDE_MAX_MULTIPLIER;
    if (c > cap) {
      return {
        ok: false,
        error: `Custom amount cannot exceed ${OVERRIDE_MAX_MULTIPLIER}× the cycle base ($${cap.toFixed(2)}).`,
        httpStatus: 400,
      };
    }
    return { ok: true, effectiveAmount: c, source: 'override' };
  }

  if (input.useCustomAmount === false && input.customAmount !== undefined) {
    return {
      ok: false,
      error: 'Remove customAmount when useCustomAmount is false, or set useCustomAmount to true.',
      httpStatus: 400,
    };
  }

  if (baseNum <= 0) {
    return {
      ok: false,
      error:
        'Cycle base amount must be greater than zero for this status. Use exempt or waived for zero, or edit the cycle.',
      httpStatus: 400,
    };
  }

  return { ok: true, effectiveAmount: baseNum, source: 'cycle' };
}
