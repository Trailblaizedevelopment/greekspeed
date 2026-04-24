import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Missing environment variables' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { searchParams } = new URL(request.url);
    const chapterIdParam = searchParams.get('chapter_id') || '';

    if (!chapterIdParam) {
      return NextResponse.json(
        { error: 'chapter_id is required' },
        { status: 400 }
      );
    }

    // Resolve chapter_id to chapter name (alumni table uses `chapter` name column)
    const { data: chapterData, error: chapterError } = await supabase
      .from('spaces')
      .select('name')
      .eq('id', chapterIdParam.trim())
      .single();

    if (chapterError || !chapterData?.name) {
      return NextResponse.json(
        { error: 'Chapter not found' },
        { status: 404 }
      );
    }

    const { count, error } = await supabase
      .from('alumni')
      .select('id', { count: 'exact', head: true })
      .eq('chapter', chapterData.name)
      .eq('is_actively_hiring', true);

    if (error) {
      console.error('Error fetching hiring count:', error);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: count ?? 0 });
  } catch (error) {
    console.error('API Route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
