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
 *   CROWDED_TEST_CHAPTER_ID=<uuid> — Crowded chapter UUID for contact calls (direct API; not Trailblaize DB id)
 *   CROWDED_TEST_CONTACT_ID=<uuid> — if set with chapter id, calls GET single contact
 *   CROWDED_TEST_ACCOUNT_ID=<id> — if set, calls GET single account (otherwise uses first list account id)
 *
 * Optional DB → Crowded mapping smoke (TRA-561):
 *   CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID=<Trailblaize chapters.id> — requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   Loads `crowded_chapter_id` from `public.chapters` and calls `listContacts` + `listAccounts` to prove DB mapping + API wiring.
 *
 * Accounts (TRA-412):
 *   GET …/accounts may return 400 `NO_CUSTOMER` until banking setup in Crowded portal — script logs a warning and continues.
 *   GET …/accounts/:id is **best-effort**: Crowded may reject the list `id` in the path (e.g. 400 “chapterId must be a positive integer”) while list still works — script warns and continues.
 *   When `CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID` is set and listAccounts returns 200, runs `syncCrowdedAccountsForTrailblaizeChapter` (upsert `public.crowded_accounts`).
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createCrowdedClientFromEnv,
  CrowdedApiError,
  isCrowdedNoCustomerError,
} from '../lib/services/crowded/crowded-client';
import { getCrowdedIdsForTrailblaizeChapter } from '../lib/services/crowded/chapterCrowdedMapping';
import { resolveCrowdedAccountApiId } from '../lib/services/crowded/crowdedAccountMapping';
import { upsertCrowdedAccountsFromList } from '../lib/services/crowded/syncCrowdedAccounts';

/** Service-role client for scripts only — avoids importing `lib/supabase/client` (browser client breaks in Node). */
function createServiceSupabaseOrNull(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) {
    return null;
  }
  return createClient(url, key);
}

async function runMappingSmokeTest(): Promise<void> {
  const trailblaizeChapterId = process.env.CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID?.trim();
  if (!trailblaizeChapterId) {
    return;
  }

  const supabase = createServiceSupabaseOrNull();
  if (!supabase) {
    console.warn(
      '[crowded] CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID set but NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skip DB mapping smoke.'
    );
    return;
  }

  console.log('\n[crowded] DB mapping smoke (TRA-561)…');
  const mapping = await getCrowdedIdsForTrailblaizeChapter(supabase, trailblaizeChapterId);

  if (!mapping) {
    console.warn(
      `[crowded] No crowded_chapter_id for Trailblaize chapter ${trailblaizeChapterId} — update public.chapters or unset CROWDED_SMOKE_TRAILBLAIZE_CHAPTER_ID.`
    );
    return;
  }

  console.log(`  mapped crowded_chapter_id: ${mapping.crowdedChapterId}`);
  if (mapping.crowdedOrganizationId) {
    console.log(`  crowded_organization_id: ${mapping.crowdedOrganizationId}`);
  }

  const client = createCrowdedClientFromEnv();
  const contacts = await client.listContacts(mapping.crowdedChapterId);
  console.log(`[crowded] listContacts via DB mapping OK — ${contacts.data.length} contact(s)`);

  try {
    const accounts = await client.listAccounts(mapping.crowdedChapterId);
    console.log(`[crowded] listAccounts via DB mapping OK — ${accounts.data.length} account(s)`);

    const persist = await upsertCrowdedAccountsFromList(
      supabase,
      trailblaizeChapterId,
      accounts.data
    );
    if (persist.ok) {
      console.log(
        `[crowded] TRA-412: crowded_accounts upsert OK — ${persist.syncedCount} row(s) (last_synced_at set)`
      );
    } else {
      console.error('[crowded] crowded_accounts upsert failed:', persist.message);
      throw new Error(persist.message);
    }
  } catch (e) {
    if (e instanceof CrowdedApiError && isCrowdedNoCustomerError(e)) {
      console.warn(
        '[crowded] listAccounts — NO_CUSTOMER (banking customer not provisioned; complete Crowded portal Finish setup).'
      );
    } else {
      throw e;
    }
  }
}

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

      try {
        const accounts = await client.listAccounts(chapterId);
        console.log(`[crowded] GET /chapters/…/accounts OK — ${accounts.data.length} account(s)`);
        const firstAcc = accounts.data[0];
        const accountId =
          process.env.CROWDED_TEST_ACCOUNT_ID?.trim() ||
          (firstAcc ? resolveCrowdedAccountApiId(firstAcc) : undefined);
        if (accountId) {
          try {
            const acc = await client.getAccount(chapterId, accountId);
            console.log('[crowded] GET /chapters/…/accounts/… OK');
            const aid = resolveCrowdedAccountApiId(acc.data);
            console.log(`  account: ${acc.data.name} (${aid ?? 'unknown id'})`);
          } catch (singleAccErr) {
            if (
              singleAccErr instanceof CrowdedApiError &&
              isCrowdedNoCustomerError(singleAccErr)
            ) {
              console.warn(
                '[crowded] GET /chapters/…/accounts/:id — NO_CUSTOMER (expected until banking setup in Crowded portal).'
              );
            } else if (singleAccErr instanceof CrowdedApiError) {
              console.warn(
                '[crowded] GET /chapters/…/accounts/:id skipped (Crowded error; list still OK):',
                singleAccErr.message
              );
              if (singleAccErr.requestId) {
                console.warn('  requestId:', singleAccErr.requestId);
              }
            } else {
              throw singleAccErr;
            }
          }
        }
      } catch (accErr) {
        if (accErr instanceof CrowdedApiError && isCrowdedNoCustomerError(accErr)) {
          console.warn(
            '[crowded] GET /chapters/…/accounts — NO_CUSTOMER (expected until banking setup in Crowded portal).'
          );
        } else {
          throw accErr;
        }
      }
    } else {
      console.log('[crowded] Skipping contacts (no chapter in response). Set CROWDED_TEST_CHAPTER_ID to force.');
    }

    await runMappingSmokeTest();

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
