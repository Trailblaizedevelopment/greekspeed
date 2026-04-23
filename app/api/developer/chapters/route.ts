import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
  try {
    // Get query parameters for pagination
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;

    // Fetch chapters with pagination
    const { data: chapters, error, count } = await supabase
      .from('spaces')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching chapters:', error);
      return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 });
    }

    return NextResponse.json({ 
      chapters: chapters || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (error) {
    console.error('Error in chapters API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const chapterData = await request.json();

    // Validate required fields
    const requiredFields = ['name', 'university', 'national_fraternity', 'chapter_name', 'location', 'founded_year', 'member_count'];
    for (const field of requiredFields) {
      if (!chapterData[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }

    // Prepare the data for insertion
    const insertData = {
      ...chapterData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Ensure these fields have default values if not provided
      events: chapterData.events || null,
      achievements: chapterData.achievements || null,
      llm_enriched: chapterData.llm_enriched || false,
      llm_data: chapterData.llm_data || null
    };

    // Insert the new chapter
    const { data: newChapter, error } = await supabase
      .from('spaces')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Error creating chapter:', error);
      return NextResponse.json({ error: 'Failed to create chapter' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      chapter: newChapter,
      message: 'Chapter created successfully' 
    });

  } catch (error) {
    console.error('Error in create chapter API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId');

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    // Delete the chapter from the chapters table
    const { error: deleteError } = await supabase
      .from('spaces')
      .delete()
      .eq('id', chapterId);

    if (deleteError) {
      console.error('Error deleting chapter:', deleteError);
      return NextResponse.json({ error: 'Failed to delete chapter' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Chapter deleted successfully' 
    });

  } catch (error) {
    console.error('Error in delete chapter API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId');
    const chapterData = await request.json();

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    // Validate required fields
    const requiredFields = ['name', 'university', 'national_fraternity', 'chapter_name', 'location', 'founded_year', 'member_count'];
    for (const field of requiredFields) {
      if (chapterData[field] === undefined || chapterData[field] === null) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }

    // Prepare the update data (don't update created_at, but update updated_at)
    const updateData = {
      ...chapterData,
      updated_at: new Date().toISOString(),
      // Ensure these fields are handled properly
      member_count: typeof chapterData.member_count === 'string' 
        ? parseInt(chapterData.member_count) 
        : chapterData.member_count,
      founded_year: typeof chapterData.founded_year === 'string' 
        ? parseInt(chapterData.founded_year) 
        : chapterData.founded_year,
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.created_at;

    // Update the chapter
    const { data: updatedChapter, error } = await supabase
      .from('spaces')
      .update(updateData)
      .eq('id', chapterId)
      .select()
      .single();

    if (error) {
      console.error('Error updating chapter:', error);
      return NextResponse.json({ error: 'Failed to update chapter' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      chapter: updatedChapter,
      message: 'Chapter updated successfully' 
    });

  } catch (error) {
    console.error('Error in update chapter API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}