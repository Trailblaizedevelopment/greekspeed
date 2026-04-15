/**
 * Call Crowded Collect API directly (no Next.js) to create intents — integration probe.
 *
 * Loads `.env.local` first (same pattern as other scripts).
 *
 * Env:
 *   CROWDED_API_BASE_URL   (optional, default sandbox)
 *   CROWDED_API_TOKEN      or CROWDED_API_KEY (required)
 *
 * CLI (single intent):
 *   npx tsx scripts/crowded-intent-direct.ts \
 *     --chapter=<crowdedChapterUuid> \
 *     --collection=<collectionUuid> \
 *     --contact=<contactUuid> \
 *     --amount-cents=10000 \
 *     [--payer-ip=203.0.113.1] [--success-url=...] [--failure-url=...]
 *
 * Env fallbacks when flags omitted:
 *   CROWDED_CHAPTER_ID, CROWDED_COLLECTION_ID, CROWDED_CONTACT_ID, CROWDED_INTENT_AMOUNT_CENTS
 *
 * Batch (one amount for all):
 *   npx tsx scripts/crowded-intent-direct.ts \
 *     --chapter=... --collection=... --amount-cents=5000 --csv=./contacts.csv
 *
 * CSV: one UUID per line; lines starting with # ignored; optional header row "contactId".
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createCrowdedCollectIntent, crowdedFetchJson } from '../lib/services/crowded/crowdedIntentHttp';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type Args = {
  chapter: string;
  collection: string;
  contact: string;
  amountCents: number;
  payerIp: string;
  csv: string | null;
  successUrl: string | null;
  failureUrl: string | null;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    chapter: process.env.CROWDED_CHAPTER_ID?.trim() ?? '',
    collection: process.env.CROWDED_COLLECTION_ID?.trim() ?? '',
    contact: process.env.CROWDED_CONTACT_ID?.trim() ?? '',
    amountCents: Number(process.env.CROWDED_INTENT_AMOUNT_CENTS ?? '100') || 100,
    payerIp: process.env.CROWDED_INTENT_PAYER_IP?.trim() || '203.0.113.1',
    csv: null,
    successUrl: process.env.CROWDED_INTENT_SUCCESS_URL?.trim() || null,
    failureUrl: process.env.CROWDED_INTENT_FAILURE_URL?.trim() || null,
    json: false,
  };

  for (const raw of argv) {
    if (raw === '--json') out.json = true;
    else if (raw.startsWith('--chapter=')) out.chapter = raw.slice('--chapter='.length).trim();
    else if (raw.startsWith('--collection=')) out.collection = raw.slice('--collection='.length).trim();
    else if (raw.startsWith('--contact=')) out.contact = raw.slice('--contact='.length).trim();
    else if (raw.startsWith('--amount-cents=')) {
      out.amountCents = Number(raw.slice('--amount-cents='.length).trim()) || out.amountCents;
    } else if (raw.startsWith('--payer-ip=')) out.payerIp = raw.slice('--payer-ip='.length).trim();
    else if (raw.startsWith('--csv=')) out.csv = raw.slice('--csv='.length).trim();
    else if (raw.startsWith('--success-url=')) out.successUrl = raw.slice('--success-url='.length).trim() || null;
    else if (raw.startsWith('--failure-url=')) out.failureUrl = raw.slice('--failure-url='.length).trim() || null;
  }

  return out;
}

function loadContactIdsFromCsv(filePath: string): string[] {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ids: string[] = [];
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (/^contactId$/i.test(line)) continue;
    if (/^[0-9a-f-]{36}$/i.test(line)) ids.push(line);
    else throw new Error(`Invalid CSV line (expected UUID): ${line}`);
  }
  return ids;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`crowded-intent-direct — POST Collect intent(s) on Crowded (direct).

Usage:
  npx tsx scripts/crowded-intent-direct.ts --chapter=<uuid> --collection=<uuid> --contact=<uuid> [--amount-cents=10000]
  npx tsx scripts/crowded-intent-direct.ts --chapter=... --collection=... --csv=./ids.csv [--amount-cents=...]

Env (.env.local): CROWDED_API_TOKEN or CROWDED_API_KEY; optional CROWDED_API_BASE_URL
Optional env defaults: CROWDED_CHAPTER_ID, CROWDED_COLLECTION_ID, CROWDED_CONTACT_ID, CROWDED_INTENT_AMOUNT_CENTS`);
    return;
  }

  const contactIds: string[] = [];
  if (args.csv) {
    contactIds.push(...loadContactIdsFromCsv(args.csv));
  } else if (args.contact) {
    contactIds.push(args.contact);
  }

  if (!args.chapter || !args.collection || contactIds.length === 0) {
    console.error(
      'Usage: npx tsx scripts/crowded-intent-direct.ts --chapter=<uuid> --collection=<uuid> --contact=<uuid> [--amount-cents=] | --csv=path\n' +
        'Or set CROWDED_CHAPTER_ID, CROWDED_COLLECTION_ID, CROWDED_CONTACT_ID / --csv=.\n' +
        'Requires CROWDED_API_TOKEN (or CROWDED_API_KEY) in .env.local.'
    );
    process.exit(1);
  }

  // Optional sanity: organizations (proves token + base URL)
  const orgProbe = await crowdedFetchJson({ method: 'GET', path: '/organizations' });
  if (args.json) {
    console.log(JSON.stringify({ probe: { organizationsStatus: orgProbe.status } }, null, 2));
  } else {
    console.log(`Crowded GET /organizations → ${orgProbe.status}`);
  }

  const results: { contactId: string; status: number; summary: string }[] = [];

  for (const contactId of contactIds) {
    const { status, json } = await createCrowdedCollectIntent({
      crowdedChapterId: args.chapter,
      collectionId: args.collection,
      data: {
        contactId,
        requestedAmount: args.amountCents,
        payerIp: args.payerIp,
        userConsented: true,
        successUrl: args.successUrl ?? undefined,
        failureUrl: args.failureUrl ?? undefined,
      },
    });

    const data = json as { data?: { paymentUrl?: string; id?: string; message?: string } };
    const paymentUrl = data?.data?.paymentUrl;
    const summary = paymentUrl
      ? `paymentUrl=${paymentUrl.slice(0, 80)}…`
      : JSON.stringify(json).slice(0, 500);

    results.push({ contactId, status, summary });

    if (args.json) {
      console.log(JSON.stringify({ contactId, status, json }, null, 2));
    } else {
      console.log(`\nPOST intent contact=${contactId} → HTTP ${status}`);
      console.log(summary);
    }
  }

  if (!args.json && results.length > 1) {
    console.log('\n--- summary ---');
    for (const r of results) {
      console.log(`${r.contactId}\t${r.status}\t${r.summary.slice(0, 120)}`);
    }
  }

  const failed = results.filter((r) => r.status < 200 || r.status >= 300);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
