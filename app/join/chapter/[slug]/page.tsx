import { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import ChapterJoinPageClient from './ChapterJoinPageClient';

const APP_NAME = ['Trail', 'blaize'].join('');

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const { slug } = await params;
    const supabase = createServerSupabaseClient();

    const { data: chapter } = await supabase
      .from('chapters')
      .select('name, chapter_name, school')
      .eq('slug', slug)
      .eq('chapter_status', 'active')
      .single();

    if (chapter) {
      return {
        title: `Join ${chapter.name} | ${APP_NAME}`,
        description: `Join ${chapter.name}${chapter.school ? ` at ${chapter.school}` : ''} on ${APP_NAME}`,
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    title: `Join Chapter | ${APP_NAME}`,
    description: `Join a chapter on ${APP_NAME}`,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function ChapterJoinPage(props: PageProps) {
  return <ChapterJoinPageClient />;
}
