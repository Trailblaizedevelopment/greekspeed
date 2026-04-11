import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveDuesAssignmentCreateAmount } from '@/lib/services/dues/resolveDuesAssignmentCreateAmount';

export interface BulkAssignMembersResult {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Creates `required` dues assignments for a list of member profile ids on a new cycle.
 * Skips members not in the chapter or duplicate assignment rows.
 */
export async function bulkAssignMembersToNewCycle(params: {
  supabase: SupabaseClient;
  chapterId: string;
  duesCycleId: string;
  memberIds: string[];
  cycleBaseAmount: number;
}): Promise<BulkAssignMembersResult> {
  const { supabase, chapterId, duesCycleId, memberIds, cycleBaseAmount } = params;
  const unique = [...new Set(memberIds.map((id) => id.trim()).filter(Boolean))];
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  const resolved = resolveDuesAssignmentCreateAmount(
    { base_amount: cycleBaseAmount },
    { status: 'required', useCustomAmount: false }
  );
  if (!resolved.ok) {
    errors.push(resolved.error);
    return { created: 0, skipped: unique.length, errors };
  }
  const effectiveAmount = resolved.effectiveAmount;

  for (const memberId of unique) {
    const { data: member, error: mErr } = await supabase
      .from('profiles')
      .select('id, chapter_id')
      .eq('id', memberId)
      .maybeSingle();

    if (mErr || !member?.chapter_id || member.chapter_id !== chapterId) {
      skipped += 1;
      errors.push(`Skipped member ${memberId}: not in chapter`);
      continue;
    }

    const { data: existing } = await supabase
      .from('dues_assignments')
      .select('id')
      .eq('dues_cycle_id', duesCycleId)
      .eq('user_id', memberId)
      .maybeSingle();

    if (existing?.id) {
      skipped += 1;
      continue;
    }

    const { error: insErr } = await supabase.from('dues_assignments').insert({
      dues_cycle_id: duesCycleId,
      user_id: memberId,
      status: 'required',
      amount_assessed: effectiveAmount,
      amount_due: effectiveAmount,
      amount_paid: 0,
      notes: '',
    });

    if (insErr) {
      skipped += 1;
      errors.push(`Member ${memberId}: ${insErr.message}`);
      continue;
    }

    await supabase
      .from('profiles')
      .update({
        current_dues_amount: effectiveAmount,
        dues_status: 'required',
        last_dues_assignment_date: new Date().toISOString(),
      })
      .eq('id', memberId);

    created += 1;
  }

  return { created, skipped, errors };
}
