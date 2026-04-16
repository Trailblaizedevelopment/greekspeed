/**
 * Run: npm run test:announcement-metadata
 * Validates sanitizeAnnouncementMetadataForCreate behavior without a test runner dependency.
 */
import assert from 'node:assert/strict';
import { ANNOUNCEMENT_IMAGE_MAX_BYTES } from '../lib/constants/announcementMedia';
import {
  getPrimaryLinkFromMetadata,
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

  // --- primary_link ---
  const plOnly = sanitizeAnnouncementMetadataForCreate(
    { primary_link: { url: 'https://forms.gle/example-path' } },
    SUPABASE
  );
  assert.equal(plOnly.ok, true);
  if (plOnly.ok) {
    assert.deepEqual(plOnly.metadata, {
      primary_link: { url: 'https://forms.gle/example-path' },
    });
    const read = getPrimaryLinkFromMetadata(plOnly.metadata);
    assert.deepEqual(read, { url: 'https://forms.gle/example-path' });
  }

  const plWithLabel = sanitizeAnnouncementMetadataForCreate(
    {
      primary_link: {
        url: '  https://example.com/x  ',
        label: ' Register here ',
      },
    },
    SUPABASE
  );
  assert.equal(plWithLabel.ok, true);
  if (plWithLabel.ok) {
    assert.deepEqual(plWithLabel.metadata.primary_link, {
      url: 'https://example.com/x',
      label: 'Register here',
    });
  }

  const plAndImage = sanitizeAnnouncementMetadataForCreate(
    {
      images: [
        {
          url: GOOD_URL,
          mimeType: 'image/jpeg',
          sizeBytes: 1000,
        },
      ],
      primary_link: { url: 'https://example.com/doc', label: 'Doc' },
      evil: true,
    },
    SUPABASE
  );
  assert.equal(plAndImage.ok, true);
  if (plAndImage.ok) {
    assert.equal('evil' in plAndImage.metadata, false);
    const imgs = plAndImage.metadata.images as Array<{ url: string }> | undefined;
    assert.equal(imgs?.length, 1);
    assert.deepEqual(plAndImage.metadata.primary_link, {
      url: 'https://example.com/doc',
      label: 'Doc',
    });
  }

  const plHttp = sanitizeAnnouncementMetadataForCreate(
    { primary_link: { url: 'http://example.com/' } },
    SUPABASE
  );
  assert.equal(plHttp.ok, false);

  const plWhitespaceLabel = sanitizeAnnouncementMetadataForCreate(
    { primary_link: { url: 'https://example.com/', label: '   ' } },
    SUPABASE
  );
  assert.equal(plWhitespaceLabel.ok, false);

  const plBadType = sanitizeAnnouncementMetadataForCreate(
    { primary_link: { url: true } } as unknown as Record<string, unknown>,
    SUPABASE
  );
  assert.equal(plBadType.ok, false);

  const plNotObject = sanitizeAnnouncementMetadataForCreate(
    { primary_link: ['https://example.com/'] } as unknown as Record<string, unknown>,
    SUPABASE
  );
  assert.equal(plNotObject.ok, false);

  const emptyMeta = sanitizeAnnouncementMetadataForCreate({ images: [] }, SUPABASE);
  assert.equal(emptyMeta.ok, true);
  if (emptyMeta.ok) assert.deepEqual(emptyMeta.metadata, {});

  console.log('announcement metadata tests: OK');
}

run();
