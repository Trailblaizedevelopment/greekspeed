/**
 * Call the Trailblaize Next.js API that proxies Crowded intent creation (validates auth + chapter ACL).
 *
 * Prereqs:
 *   npm run dev   (or set CROWDED_APP_BASE_URL to your deployed origin)
 *
 * Env (.env.local):
 *   CROWDED_APP_BASE_URL     optional, default http://localhost:3000
 *   CROWDED_TEST_BEARER      Supabase JWT for a user who can manage the chapter (same as browser session)
 *   CROWDED_TEST_CHAPTER_ID  Trailblaize chapter UUID (path param [id])
 *   CROWDED_COLLECTION_ID    Crowded collection UUID (path param)
 *   CROWDED_CONTACT_ID       Crowded contact UUID (JSON body)
 *   CROWDED_INTENT_AMOUNT_CENTS  optional, default 100
 *
 * CLI overrides:
 *   --url=http://localhost:3000
 *   --bearer=<jwt>
 *   --chapter=<trailblaizeChapterUuid>
 *   --collection=<crowdedCollectionUuid>
 *   --contact=<crowdedContactUuid>
 *   --amount-cents=10000
 *   --crowded-chapter=<uuid>   (JSON body; only when DB has no crowded_chapter_id and user is admin/developer)
 *   --payer-ip=203.0.113.1
 *   --json
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type Args = {
  baseUrl: string;
  bearer: string;
  chapter: string;
  collection: string;
  contact: string;
  amountCents: number;
  payerIp: string | null;
  crowdedChapterBody: string | null;
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    baseUrl: (process.env.CROWDED_APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
      .trim()
      .replace(/\/$/, ''),
    bearer: process.env.CROWDED_TEST_BEARER?.trim() ?? '',
    chapter: process.env.CROWDED_TEST_CHAPTER_ID?.trim() ?? '',
    collection: process.env.CROWDED_COLLECTION_ID?.trim() ?? '',
    contact: process.env.CROWDED_CONTACT_ID?.trim() ?? '',
    amountCents: Number(process.env.CROWDED_INTENT_AMOUNT_CENTS ?? '100') || 100,
    payerIp: process.env.CROWDED_INTENT_PAYER_IP?.trim() || null,
    crowdedChapterBody: process.env.CROWDED_BODY_CROWDED_CHAPTER_ID?.trim() || null,
    json: false,
  };

  for (const raw of argv) {
    if (raw === '--json') out.json = true;
    else if (raw.startsWith('--url=')) out.baseUrl = raw.slice('--url='.length).trim().replace(/\/$/, '');
    else if (raw.startsWith('--bearer=')) out.bearer = raw.slice('--bearer='.length).trim();
    else if (raw.startsWith('--chapter=')) out.chapter = raw.slice('--chapter='.length).trim();
    else if (raw.startsWith('--collection=')) out.collection = raw.slice('--collection='.length).trim();
    else if (raw.startsWith('--contact=')) out.contact = raw.slice('--contact='.length).trim();
    else if (raw.startsWith('--amount-cents=')) {
      out.amountCents = Number(raw.slice('--amount-cents='.length).trim()) || out.amountCents;
    } else if (raw.startsWith('--payer-ip=')) out.payerIp = raw.slice('--payer-ip='.length).trim();
    else if (raw.startsWith('--crowded-chapter=')) {
      out.crowdedChapterBody = raw.slice('--crowded-chapter='.length).trim();
    }
  }

  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`crowded-intent-via-app — POST /api/chapters/[id]/crowded/collections/[collectionId]/intents

Example:
  npx tsx scripts/crowded-intent-via-app.ts \\
    --url=http://localhost:3000 \\
    --bearer=<supabase_access_token> \\
    --chapter=<trailblaize_chapter_id> \\
    --collection=<crowded_collection_id> \\
    --contact=<crowded_contact_id> \\
    --amount-cents=10000

Get a bearer token: sign in in the browser → DevTools → Application → Local Storage → supabase auth token,
or use Supabase dashboard / your auth helper.

Optional: --crowded-chapter=<crowded_chapter_uuid> when chapters.crowded_chapter_id is null (admin/developer only).`);
    return;
  }

  const args = parseArgs(argv);

  if (!args.bearer || !args.chapter || !args.collection || !args.contact) {
    console.error(
      'Missing required args or env. Need: --bearer (or CROWDED_TEST_BEARER), --chapter, --collection, --contact\n' +
        'See --help.'
    );
    process.exit(1);
  }

  const url = `${args.baseUrl}/api/chapters/${args.chapter}/crowded/collections/${args.collection}/intents`;

  const body: Record<string, unknown> = {
    contactId: args.contact,
    requestedAmount: args.amountCents,
    userConsented: true,
  };
  if (args.payerIp) body.payerIp = args.payerIp;
  if (args.crowdedChapterBody) body.crowdedChapterId = args.crowdedChapterBody;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text.slice(0, 4000) };
  }

  if (args.json) {
    console.log(JSON.stringify({ httpStatus: res.status, body: parsed }, null, 2));
  } else {
    console.log(`POST ${url}`);
    console.log(`HTTP ${res.status}`);
    console.log(typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : String(parsed));
  }

  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
