/**
 * Run: npm run test:announcement-metadata
 * Validates sanitizeAnnouncementMetadataForCreate behavior without a test runner dependency.
 */
import assert from 'node:assert/strict';
import { ANNOUNCEMENT_IMAGE_MAX_BYTES } from '../lib/constants/announcementMedia';
import {
  sanitizeAnnouncementMetadataForCreate,
} from '../lib/validation/announcementMetadata';

const SUPABASE = 'https://abcxyz.supabase.co';
const GOOD_URL = `${SUPABASE}/storage/v1/object/public/announcement-images/user/a.jpg`;

function run() {
  const a = sanitizeAnnouncementMetadataForCreate(undefined, SUPABASE);
  assert.equal(a.ok, true);
  if (a.ok) assert.deepEqual(a.metadata, {});

  const b = sanitizeAnnouncementMetadataForCreate(null, SUPABASE);
  assert.equal(b.ok, true);
  if (b.ok) assert.deepEqual(b.metadata, {});

  const c = sanitizeAnnouncementMetadataForCreate(
    {
      images: [
        {
          url: GOOD_URL,
          mimeType: 'image/jpeg',
          sizeBytes: 1000,
        },
      ],
    },
    SUPABASE
  );
  assert.equal(c.ok, true);
  if (c.ok) {
    const imgs = c.metadata.images as Array<{ url: string }> | undefined;
    assert.equal(imgs?.length, 1);
    assert.equal(imgs?.[0]?.url, GOOD_URL);
  }

  const payloadWithExtra: Record<string, unknown> = {
    images: [
      {
        url: GOOD_URL,
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
      },
    ],
    evil: true,
  };
  const d = sanitizeAnnouncementMetadataForCreate(payloadWithExtra, SUPABASE);
  assert.equal(d.ok, true);
  if (d.ok) assert.equal('evil' in d.metadata, false);

  const e = sanitizeAnnouncementMetadataForCreate(
    {
      images: [
        { url: GOOD_URL, mimeType: 'image/jpeg', sizeBytes: 1000 },
        { url: GOOD_URL, mimeType: 'image/jpeg', sizeBytes: 1000 },
      ],
    },
    SUPABASE
  );
  assert.equal(e.ok, false);

  const f = sanitizeAnnouncementMetadataForCreate(
    {
      images: [
        {
          url: 'https://evil.com/x.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1000,
        },
      ],
    },
    SUPABASE
  );
  assert.equal(f.ok, false);

  const atMax = sanitizeAnnouncementMetadataForCreate(
    {
      images: [
        {
          url: GOOD_URL,
          mimeType: 'image/jpeg',
          sizeBytes: ANNOUNCEMENT_IMAGE_MAX_BYTES,
        },
      ],
    },
    SUPABASE
  );
  assert.equal(atMax.ok, true);

  const overMax = sanitizeAnnouncementMetadataForCreate(
    {
      images: [
        {
          url: GOOD_URL,
          mimeType: 'image/jpeg',
          sizeBytes: ANNOUNCEMENT_IMAGE_MAX_BYTES + 1,
        },
      ],
    },
    SUPABASE
  );
  assert.equal(overMax.ok, false);

  console.log('announcement metadata tests: OK');
}

run();
