import { z } from 'zod';

/** POST /api/dues/cycles — create cycle; optional Crowded link + member assignments in one request. */
export const duesCyclePostBodySchema = z.object({
  chapterId: z.string().uuid().optional(),
  name: z.string().min(1).max(500),
  base_amount: z.coerce.number().finite().nonnegative(),
  due_date: z.string().min(1),
  close_date: z.string().nullable().optional(),
  allow_payment_plans: z.boolean().optional().default(false),
  plan_options: z.array(z.unknown()).optional().default([]),
  late_fee_policy: z.unknown().nullable().optional(),
  description: z.string().max(5000).optional(),
  /** When true, creates a Crowded collection and sets `crowded_collection_id` (requires chapter Crowded setup). */
  linkCrowded: z.boolean().optional().default(false),
  /** Members to assign `required` dues for this cycle (same chapter only). */
  assignMemberIds: z.array(z.string().uuid()).max(500).optional().default([]),
});

export type DuesCyclePostBody = z.infer<typeof duesCyclePostBodySchema>;
