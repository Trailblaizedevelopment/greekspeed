import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { canManageChapterForContext } from '@/lib/permissions';
import { canAccessDeveloperPortal } from '@/lib/developerPermissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import { isValidHexColor, normalizeHexColor } from '@/types/branding';
import type { ChapterBranding } from '@/types/branding';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Helper to authenticate - supports both Bearer token and cookies (same pattern as features route)
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
 * GET /api/branding/chapters/[chapterId]
 * Fetch branding for a specific chapter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const { chapterId } = await params;

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    // Authenticate using the helper function (supports Bearer token and cookies)
    const auth = await authenticateRequest(request);
    if (!auth) {
      console.error('❌ GET /api/branding/chapters/[chapterId]: Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, supabase } = auth;

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, chapter_id, chapter_role, is_developer')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ GET /api/branding/chapters/[chapterId]: Profile not found', profileError);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isDeveloper = canAccessDeveloperPortal(profile);
    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    const canManage = isDeveloper || canManageChapterForContext(profile, chapterId, managedChapterIds);

    if (!canManage) {
      console.error('❌ GET /api/branding/chapters/[chapterId]: Insufficient permissions');
      return NextResponse.json(
        { error: 'Insufficient permissions to access this chapter branding' },
        { status: 403 }
      );
    }

    // Fetch branding
    const { data: branding, error: brandingError } = await supabase
      .from('chapter_branding')
      .select('*')
      .eq('chapter_id', chapterId)
      .maybeSingle();

    if (brandingError) {
      console.error('❌ GET /api/branding/chapters/[chapterId]: Error fetching branding:', brandingError);
      return NextResponse.json({ error: 'Failed to fetch branding' }, { status: 500 });
    }

    console.log('✅ GET /api/branding/chapters/[chapterId]: Success', { chapterId, hasBranding: !!branding });
    // Return null if no branding found (allows creating new branding)
    return NextResponse.json(branding || null);
  } catch (error) {
    console.error('❌ GET /api/branding/chapters/[chapterId]: Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/branding/chapters/[chapterId]
 * Update branding for a specific chapter (creates if doesn't exist)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const { chapterId } = await params;

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    // Authenticate using the helper function
    const auth = await authenticateRequest(request);
    if (!auth) {
      console.error('❌ PUT /api/branding/chapters/[chapterId]: Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, supabase } = auth;

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, chapter_id, chapter_role, is_developer')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ PUT /api/branding/chapters/[chapterId]: Profile not found', profileError);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isDeveloper = canAccessDeveloperPortal(profile);
    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    const canManage = isDeveloper || canManageChapterForContext(profile, chapterId, managedChapterIds);

    if (!canManage) {
      console.error('❌ PUT /api/branding/chapters/[chapterId]: Insufficient permissions');
      return NextResponse.json(
        { error: 'Insufficient permissions to update this chapter branding' },
        { status: 403 }
      );
    }

    // Verify chapter exists
    const { data: chapter, error: chapterError } = await supabase
      .from('spaces')
      .select('id')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const {
      primary_logo_url,
      secondary_logo_url,
      logo_alt_text,
      primary_color,
      accent_color,
      organization_id,
    } = body;

    // Validate colors if provided
    if (primary_color && !isValidHexColor(primary_color)) {
      return NextResponse.json(
        { error: 'Invalid primary color format. Must be a valid hex color (e.g., #FF5733)' },
        { status: 400 }
      );
    }

    if (accent_color && !isValidHexColor(accent_color)) {
      return NextResponse.json(
        { error: 'Invalid accent color format. Must be a valid hex color (e.g., #33C3F0)' },
        { status: 400 }
      );
    }

    // Normalize colors (ensure # prefix)
    const normalizedPrimaryColor = primary_color ? normalizeHexColor(primary_color) : null;
    const normalizedAccentColor = accent_color ? normalizeHexColor(accent_color) : null;

    // Check if branding already exists
    const { data: existingBranding } = await supabase
      .from('chapter_branding')
      .select('id')
      .eq('chapter_id', chapterId)
      .maybeSingle();

    const updateData: Partial<ChapterBranding> = {
      chapter_id: chapterId,
      primary_logo_url: primary_logo_url || null,
      secondary_logo_url: secondary_logo_url || null,
      logo_alt_text: logo_alt_text || 'Chapter Logo',
      primary_color: normalizedPrimaryColor,
      accent_color: normalizedAccentColor,
      organization_id: organization_id || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    let branding: ChapterBranding;

    if (existingBranding) {
      // Update existing branding
      const { data: updated, error: updateError } = await supabase
        .from('chapter_branding')
        .update(updateData)
        .eq('chapter_id', chapterId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating branding:', updateError);
        return NextResponse.json({ error: 'Failed to update branding' }, { status: 500 });
      }

      branding = updated;
    } else {
      // Create new branding
      const { data: created, error: createError } = await supabase
        .from('chapter_branding')
        .insert({
          ...updateData,
          created_at: new Date().toISOString(),
          created_by: user.id,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating branding:', createError);
        return NextResponse.json({ error: 'Failed to create branding' }, { status: 500 });
      }

      branding = created;
    }

    return NextResponse.json({
      success: true,
      branding,
      message: existingBranding ? 'Branding updated successfully' : 'Branding created successfully',
    });
  } catch (error) {
    console.error('Error in PUT branding API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/branding/chapters/[chapterId]
 * Create branding for a specific chapter (fails if already exists)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const { chapterId } = await params;

    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    // Authenticate using the helper function
    const auth = await authenticateRequest(request);
    if (!auth) {
      console.error('❌ POST /api/branding/chapters/[chapterId]: Authentication failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, supabase } = auth;

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, chapter_id, chapter_role, is_developer')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ POST /api/branding/chapters/[chapterId]: Profile not found', profileError);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isDeveloper = canAccessDeveloperPortal(profile);
    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    const canManage = isDeveloper || canManageChapterForContext(profile, chapterId, managedChapterIds);

    if (!canManage) {
      console.error('❌ POST /api/branding/chapters/[chapterId]: Insufficient permissions');
      return NextResponse.json(
        { error: 'Insufficient permissions to create branding for this chapter' },
        { status: 403 }
      );
    }

    // Verify chapter exists
    const { data: chapter, error: chapterError } = await supabase
      .from('spaces')
      .select('id')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // Check if branding already exists
    const { data: existingBranding } = await supabase
      .from('chapter_branding')
      .select('id')
      .eq('chapter_id', chapterId)
      .maybeSingle();

    if (existingBranding) {
      return NextResponse.json(
        { error: 'Branding already exists for this chapter. Use PUT to update.' },
        { status: 409 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      primary_logo_url,
      secondary_logo_url,
      logo_alt_text,
      primary_color,
      accent_color,
      organization_id,
    } = body;

    // Validate colors if provided
    if (primary_color && !isValidHexColor(primary_color)) {
      return NextResponse.json(
        { error: 'Invalid primary color format. Must be a valid hex color (e.g., #FF5733)' },
        { status: 400 }
      );
    }

    if (accent_color && !isValidHexColor(accent_color)) {
      return NextResponse.json(
        { error: 'Invalid accent color format. Must be a valid hex color (e.g., #33C3F0)' },
        { status: 400 }
      );
    }

    // Normalize colors
    const normalizedPrimaryColor = primary_color ? normalizeHexColor(primary_color) : null;
    const normalizedAccentColor = accent_color ? normalizeHexColor(accent_color) : null;

    // Create branding
    const { data: branding, error: createError } = await supabase
      .from('chapter_branding')
      .insert({
        chapter_id: chapterId,
        primary_logo_url: primary_logo_url || null,
        secondary_logo_url: secondary_logo_url || null,
        logo_alt_text: logo_alt_text || 'Chapter Logo',
        primary_color: normalizedPrimaryColor,
        accent_color: normalizedAccentColor,
        organization_id: organization_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating branding:', createError);
      return NextResponse.json({ error: 'Failed to create branding' }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        branding,
        message: 'Branding created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST branding API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
