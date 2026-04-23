import { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import ChapterJoinPageClient from './ChapterJoinPageClient';

const APP_NAME = ['Trail', 'blaize'].join('');

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.trailblaize.net';

  try {
    const { slug } = await params;
    const supabase = createServerSupabaseClient();

    const { data: chapter } = await supabase
      .from('spaces')
      .select('name, chapter_name, school')
      .eq('slug', slug)
      .eq('chapter_status', 'active')
      .single();

    if (chapter) {
      const title = `Join ${chapter.name} | ${APP_NAME}`;
      const description = `Join ${chapter.name}${chapter.school ? ` at ${chapter.school}` : ''} on ${APP_NAME}`;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          url: `${baseUrl}/join/chapter/${slug}`,
          siteName: APP_NAME,
          images: [
            {
              url: '/og/Trailblaize.png',
              width: 1200,
              height: 630,
              alt: title,
            },
          ],
          type: 'website',
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description,
          images: ['/og/Trailblaize.png'],
        },
      };
    }
  } catch {
    // Fall through to default
  }

  const fallbackTitle = `Join Chapter | ${APP_NAME}`;
  const fallbackDescription = `Join a chapter on ${APP_NAME}`;

  return {
    title: fallbackTitle,
    description: fallbackDescription,
    openGraph: {
      title: fallbackTitle,
      description: fallbackDescription,
      url: `${baseUrl}/join`,
      siteName: APP_NAME,
      images: [
        {
          url: '/og/Trailblaize.png',
          width: 1200,
          height: 630,
          alt: fallbackTitle,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: fallbackTitle,
      description: fallbackDescription,
      images: ['/og/Trailblaize.png'],
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function ChapterJoinPage(props: PageProps) {
  return <ChapterJoinPageClient />;
}
