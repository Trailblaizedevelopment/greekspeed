import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { canAccessDeveloperPortal } from '@/lib/developerPermissions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Helper to authenticate - supports both Bearer token and cookies
async function authenticateRequest(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  // Try Bearer token first (for client-side hooks)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (!error && user) {
      console.log('✅ Authenticated via Bearer token:', user.id);
      return { 
        user, 
        supabase: createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!) 
      };
    }
  }
  
  // Fall back to cookies - use request.cookies directly (more reliable in Next.js 15)
  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set() {}, // No-op for API routes
        remove() {}, // No-op for API routes
      },
    });
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      console.log('❌ Cookie auth failed:', error?.message || 'No user');
      return null;
    }
    
    console.log('✅ Authenticated via cookies:', user.id);
    return { 
      user, 
      supabase: createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!) 
    };
  } catch (cookieError) {
    console.error('❌ Cookie auth exception:', cookieError);
    return null;
  }
}

/**
 * GET /api/branding/chapters
 * List all chapter branding records (developer only)
 * Supports pagination and filtering
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate using the helper function (supports Bearer token and cookies)
    const auth = await authenticateRequest(request);
    if (!auth) {
      console.error('❌ GET /api/branding/chapters: Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, supabase } = auth;

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_developer')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ GET /api/branding/chapters: Profile not found', profileError);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Only developers can list all chapter branding
    if (!canAccessDeveloperPortal(profile)) {
      console.error('❌ GET /api/branding/chapters: Insufficient permissions', { userId: user.id, isDeveloper: profile.is_developer });
      return NextResponse.json(
        { error: 'Insufficient permissions. Developer access required.' },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';

    // Use the authenticated supabase client (already service role from authenticateRequest)
    const serviceSupabase = supabase;

    // Build query
    let query = serviceSupabase
      .from('chapter_branding')
      .select(
        `
        *,
        chapter:spaces!chapter_id(
          id,
          name,
          chapter_name,
          university,
          national_fraternity
        )
      `,
        { count: 'exact' }
      );

    // Apply search filter if provided
    if (search) {
      query = query.or(
        `chapter.name.ilike.%${search}%,chapter.chapter_name.ilike.%${search}%,chapter.university.ilike.%${search}%`
      );
    }

    // Apply pagination
    query = query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1);

    // Execute query
    const { data: brandingRecords, error, count } = await query;

    if (error) {
      console.error('Error fetching branding records:', error);
      return NextResponse.json({ error: 'Failed to fetch branding records' }, { status: 500 });
    }

    // Also fetch chapters without branding for complete status
    const { data: allChapters } = await serviceSupabase
      .from('spaces')
      .select('id, name, chapter_name, university')
      .eq('chapter_status', 'active');

    const chaptersWithBranding = new Set(
      brandingRecords?.map((b: any) => b.chapter_id) || []
    );
    const chaptersWithoutBranding =
      allChapters?.filter((c) => !chaptersWithBranding.has(c.id)) || [];

    return NextResponse.json({
      branding: brandingRecords || [],
      chaptersWithoutBranding,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      search,
    });
  } catch (error) {
    console.error('Error in GET branding chapters API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

