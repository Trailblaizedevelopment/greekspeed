/**
 * PostgREST may return embedded FK rows as an object or a single-element array.
 * RLS or a client without session can yield null — callers must handle null cycle.
 */
export type DuesCycleEmbed = {
  id?: string;
  name: string;
  due_date: string;
  allow_payment_plans: boolean;
  plan_options: unknown[];
  crowded_collection_id?: string | null;
};

export function unwrapDuesCycleEmbed(raw: unknown): DuesCycleEmbed | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' ? (first as DuesCycleEmbed) : null;
  }
  if (typeof raw === 'object') return raw as DuesCycleEmbed;
  return null;
}

/** Safe label for UI when cycle or due_date is missing (avoids "Invalid Date"). */
export function formatDuesDueDateLabel(cycle: DuesCycleEmbed | null | undefined): string {
  const raw = cycle?.due_date;
  if (!raw || typeof raw !== 'string') {
    return 'Due soon — contact your chapter for the due date';
  }
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) {
    return 'Due soon — contact your chapter for the due date';
  }
  return `Due on ${new Date(raw).toLocaleDateString()}`;
}
