import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: 'Chapter slug is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: chapter, error } = await supabase
      .from('chapters')
      .select('id, name, chapter_name, school, university, location, slug, chapter_status')
      .eq('slug', slug)
      .eq('chapter_status', 'active')
      .single();

    if (error || !chapter) {
      return NextResponse.json({
        valid: false,
        error: 'Chapter not found or inactive'
      }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      chapter: {
        id: chapter.id,
        name: chapter.name,
        chapter_name: chapter.chapter_name,
        school: chapter.school,
        university: chapter.university,
        location: chapter.location,
        slug: chapter.slug,
      }
    });
  } catch (error) {
    console.error('Chapter join API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
