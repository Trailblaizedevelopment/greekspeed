import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Try to get by UUID first, then by name
    let { data: chapter, error } = await supabase
      .from('spaces')
      .select('*')
      .eq('id', id)
      .single();

    if (!chapter && !error) {
      const { data: chapters, error: nameError } = await supabase
        .from('spaces')
        .select('*')
        .eq('name', id)
        .single();
      
      if (chapters) {
        chapter = chapters;
        error = null;
      } else {
        error = nameError;
      }
    }

    if (error || !chapter) {
      return await createChapterWithLLM(id, supabase);
    }

    if (!chapter.llm_enriched) {
      await enrichChapterWithLLM(chapter, supabase);
      const { data: updatedChapter } = await supabase
        .from('spaces')
        .select('*')
        .eq('id', chapter.id)
        .single();
      chapter = updatedChapter;
    }

    return NextResponse.json(chapter);
  } catch (error) {
    console.error('Chapter API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function createChapterWithLLM(name: string, supabase: any) {
  // Placeholder - implement when LLM functionality is ready
  return NextResponse.json({
    name,
    description: 'Chapter information not yet available',
    llm_enriched: false,
  });
}

async function enrichChapterWithLLM(chapter: any, supabase: any) {
  // Placeholder - implement when LLM functionality is ready
  // LLM enrichment not yet implemented for chapter
}
