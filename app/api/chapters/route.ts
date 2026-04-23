import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch all active chapters - only the three you specified
    const { data: chapters, error } = await supabase
      .from('spaces')
      .select('id, name, chapter_name, school, location, university, slug')
      .eq('chapter_status', 'active')
      .order('name', { ascending: true });

    if (error) {
      console.error('Chapters API error:', error);
      return NextResponse.json({ error: 'Failed to fetch chapters' }, { status: 500 });
    }

    return NextResponse.json(chapters || []);
  } catch (error) {
    console.error('Chapters API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
