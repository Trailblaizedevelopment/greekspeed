/** Outstanding balance in USD minor units (cents) from `amount_due` and `amount_paid` (dollars). */
export function dollarsOutstandingToCents(amountDue: unknown, amountPaid: unknown): number | null {
  const due = Number(amountDue);
  const paid = Number(amountPaid);
  if (!Number.isFinite(due) || !Number.isFinite(paid)) {
    return null;
  }
  const usd = due - paid;
  if (usd <= 0) return null;
  const cents = Math.round(usd * 100);
  return cents >= 1 ? cents : null;
}
