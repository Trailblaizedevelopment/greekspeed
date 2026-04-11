import { createClient } from '@supabase/supabase-js';

/** Service-role delete for rollback when Crowded linking fails after cycle insert. */
export async function deleteDuesCycleByIdAdmin(duesCycleId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) {
    console.error('deleteDuesCycleByIdAdmin: missing Supabase env');
    return;
  }
  const admin = createClient(url, key);
  await admin.from('dues_assignments').delete().eq('dues_cycle_id', duesCycleId);
  await admin.from('dues_cycles').delete().eq('id', duesCycleId);
}
