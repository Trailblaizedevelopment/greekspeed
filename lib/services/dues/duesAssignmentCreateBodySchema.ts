import { z } from 'zod';

/**
 * POST /api/dues/assignments — treasurer creates an assignment; amount defaults from cycle unless overridden.
 */
export const duesAssignmentCreateBodySchema = z
  .object({
    memberId: z.string().uuid(),
    cycleId: z.string().uuid(),
    status: z.enum(['required', 'exempt', 'reduced', 'waived', 'paid']).optional(),
    notes: z.string().optional(),
    useCustomAmount: z.boolean().optional(),
    customAmount: z.number().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.customAmount !== undefined && val.useCustomAmount !== true) {
      ctx.addIssue({
        code: 'custom',
        message: 'Set useCustomAmount to true when sending customAmount.',
        path: ['customAmount'],
      });
    }
    if (val.useCustomAmount === true && val.customAmount === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'customAmount is required when useCustomAmount is true.',
        path: ['customAmount'],
      });
    }
    if (val.useCustomAmount === false && val.customAmount !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Remove customAmount when useCustomAmount is false.',
        path: ['customAmount'],
      });
    }
  });

export type DuesAssignmentCreateBody = z.infer<typeof duesAssignmentCreateBodySchema>;
