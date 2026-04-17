import { z } from 'zod';

export const SUPPORT_REQUEST_CATEGORIES = ['question', 'bug', 'billing', 'other'] as const;

export type SupportRequestCategory = (typeof SUPPORT_REQUEST_CATEGORIES)[number];

const MAX_SUBJECT_LEN = 200;
const MAX_BODY_LEN = 10_000;
const MAX_PAGE_URL_LEN = 2048;
const MAX_USER_AGENT_LEN = 500;

export const supportRequestBodySchema = z.object({
  category: z.enum(SUPPORT_REQUEST_CATEGORIES),
  subject: z
    .string()
    .trim()
    .min(1, 'Subject is required')
    .max(MAX_SUBJECT_LEN, `Subject must be at most ${MAX_SUBJECT_LEN} characters`),
  body: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(MAX_BODY_LEN, `Message must be at most ${MAX_BODY_LEN} characters`),
  pageUrl: z.string().max(MAX_PAGE_URL_LEN).optional().nullable(),
  userAgent: z.string().max(MAX_USER_AGENT_LEN).optional().nullable(),
});

export type SupportRequestBody = z.infer<typeof supportRequestBodySchema>;
