/**
 * Smoke-test Crowded sandbox API from Node (matches Postman).
 *
 * Prerequisites:
 *   - `.env.local` with CROWDED_API_BASE_URL and CROWDED_API_TOKEN (or legacy CROWDED_API_KEY)
 *
 * Usage:
 *   npm run test:crowded
 *   CROWDED_VALIDATE_RESPONSES=true npm run test:crowded
 *
 * Optional:
 *   CROWDED_TEST_CHAPTER_ID=<uuid> — if set, also lists contacts and optionally fetches one contact
 *   CROWDED_TEST_CONTACT_ID=<uuid> — if set with chapter id, calls GET single contact
 */

import path from 'path';
import dotenv from 'dotenv';
import {
  createCrowdedClientFromEnv,
  CrowdedApiError,
} from '../lib/services/crowded/crowded-client';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main(): Promise<void> {
  console.log('[crowded] Loading client from env…');
  const client = createCrowdedClientFromEnv();

  try {
    const orgs = await client.listOrganizations();
    console.log('[crowded] GET /organizations OK');
    console.log(`  organizations: ${orgs.data.length} (total meta: ${orgs.meta.pagination.total})`);
    if (orgs.data[0]) {
      console.log(`  first org: ${orgs.data[0].name} (${orgs.data[0].id})`);
    }

    const chapters = await client.listChapters();
    console.log('[crowded] GET /chapters OK');
    console.log(`  chapters: ${chapters.data.length}`);
    if (chapters.data[0]) {
      const ch = chapters.data[0];
      console.log(`  first chapter: ${ch.organization} (${ch.id})`);
    }

    const chapterId =
      process.env.CROWDED_TEST_CHAPTER_ID?.trim() || chapters.data[0]?.id;
    if (chapterId) {
      const contacts = await client.listContacts(chapterId);
      console.log(`[crowded] GET /chapters/…/contacts OK (chapter ${chapterId.slice(0, 8)}…)`);
      console.log(`  contacts: ${contacts.data.length}`);

      const contactId =
        process.env.CROWDED_TEST_CONTACT_ID?.trim() || contacts.data[0]?.id;
      if (contactId) {
        const one = await client.getContact(chapterId, contactId);
        console.log('[crowded] GET /chapters/…/contacts/… OK');
        console.log(`  contact: ${one.data.firstName} ${one.data.lastName} (${one.data.id})`);
      }
    } else {
      console.log('[crowded] Skipping contacts (no chapter in response). Set CROWDED_TEST_CHAPTER_ID to force.');
    }

    console.log('\n[crowded] All requested checks passed.');
  } catch (e) {
    if (e instanceof CrowdedApiError) {
      console.error('[crowded] CrowdedApiError:', e.message);
      console.error('  statusCode:', e.statusCode);
      console.error('  type:', e.type);
      console.error('  details:', e.details);
      console.error('  requestId:', e.requestId);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}

main().catch((err) => {
  console.error('[crowded] Fatal:', err);
  process.exit(1);
});
