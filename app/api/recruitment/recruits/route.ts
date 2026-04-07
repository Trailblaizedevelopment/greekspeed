import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isFeatureEnabled } from '@/types/featureFlags';
import type { CreateRecruitRequest } from '@/types/recruitment';
import { EXECUTIVE_ROLES } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';
import type { RecruitStage } from '@/types/recruitment';

// Helper function to validate phone number format
function isValidPhoneNumber(phoneNumber: string): boolean {
  const cleaned = phoneNumber.replace(/\D/g, '');
  return cleaned.length === 10 || cleaned.length === 11;
}

// Helper function to strip @ symbol from Instagram handle
function normalizeInstagramHandle(handle: string | undefined): string | undefined {
  if (!handle) return undefined;
  return handle.replace(/^@+/, '').trim() || undefined;
}

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
      // Create a client with the access token set in the session
      const authenticatedSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
      return { user, supabase: authenticatedSupabase };
    }
  }
  
  // Fall back to cookies
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    });
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      console.log('❌ Cookie auth failed:', error?.message || 'No user');
      return null;
    }
    
    console.log('✅ Authenticated via cookies:', user.id);
    return { user, supabase };
  } catch (cookieError) {
    console.error('❌ Cookie auth exception:', cookieError);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate request (supports both Bearer token and cookies)
    const auth = await authenticateRequest(request);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { user, supabase } = auth;

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role, is_developer, signup_channel')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Parse query parameters (include optional chapter override for internal/developer traversal)
    const { searchParams } = new URL(request.url);
    const requestedChapterId = searchParams.get('chapter_id')?.trim() || null;

    const isDeveloper = profile.is_developer === true;
    const isAdmin = profile.role === 'admin';
    const isGovernance = profile.role === 'governance';
    let managedChapterIds: string[] | undefined;
    if (isGovernance) {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    const canRequestChapter =
      requestedChapterId &&
      (isDeveloper ||
        isAdmin ||
        (isGovernance && managedChapterIds?.includes(requestedChapterId)));
    const effectiveChapterId = canRequestChapter ? requestedChapterId! : profile.chapter_id;

    if (requestedChapterId && !canRequestChapter) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view another chapter' },
        { status: 403 },
      );
    }

    if (!effectiveChapterId) {
      if (
        profile.signup_channel === 'marketing_alumni' &&
        !profile.chapter_id &&
        !isDeveloper
      ) {
        return NextResponse.json(
          { error: 'Chapter membership is pending approval' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'User must belong to a chapter' }, { status: 400 });
    }

    // Feature flag check: Query chapters table for feature_flags
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, feature_flags')
      .eq('id', effectiveChapterId)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // Check if recruitment_crm_enabled feature flag is enabled
    if (!isFeatureEnabled(chapter.feature_flags, 'recruitment_crm_enabled')) {
      return NextResponse.json({ error: 'Recruitment CRM feature is not enabled for this chapter' }, { status: 403 });
    }

    const isExec = profile.chapter_role && EXECUTIVE_ROLES.includes(profile.chapter_role as any);
    const canViewAsGovernance = isGovernance && managedChapterIds?.includes(effectiveChapterId);

    if (!isDeveloper && !isAdmin && !isExec && !canViewAsGovernance) {
      return NextResponse.json({
        error: 'Insufficient permissions. Only execs and admins can view recruits.',
      }, { status: 403 });
    }

    const stage = searchParams.get('stage') as RecruitStage | null;
    const search = searchParams.get('search')?.trim() || null;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50')), 100); // Max 100 per page
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';

    // Calculate pagination offset
    const offset = (page - 1) * limit;

    // Build query with join to profiles table
    let query = supabase
      .from('recruits')
      .select(`
        *,
        submitted_by_profile:profiles!recruits_submitted_by_fkey(
          id,
          full_name
        )
      `, { count: 'exact' })
      .eq('chapter_id', effectiveChapterId);

    // Apply stage filter if provided
    if (stage) {
      // Validate stage is a valid RecruitStage
      const validStages: RecruitStage[] = ['New', 'Contacted', 'Event Invite', 'Bid Given', 'Accepted', 'Declined'];
      if (validStages.includes(stage)) {
        query = query.eq('stage', stage);
      } else {
        return NextResponse.json({ error: 'Invalid stage value' }, { status: 400 });
      }
    }

    // Apply search filter if provided (search in name or hometown)
    if (search) {
      query = query.or(`name.ilike.%${search}%,hometown.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data: recruits, error: queryError, count } = await query;

    if (queryError) {
      console.error('Error fetching recruits:', queryError);
      return NextResponse.json({ 
        error: 'Failed to fetch recruits',
        details: queryError.message 
      }, { status: 500 });
    }

    // Transform data to include submitted_by_name from joined profile
    const transformedRecruits = (recruits || []).map((recruit: any) => ({
      ...recruit,
      submitted_by_name: recruit.submitted_by_profile?.full_name || null,
      // Remove the nested profile object
      submitted_by_profile: undefined,
    }));

    // Calculate pagination metadata
    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    // Return response with pagination metadata
    return NextResponse.json({
      data: transformedRecruits,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });

  } catch (error) {
    console.error('Error in GET /api/recruitment/recruits:', error);
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate request (supports both Bearer token and cookies)
    const auth = await authenticateRequest(request);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { user, supabase } = auth;

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Ensure user has a chapter_id
    if (!profile.chapter_id) {
      return NextResponse.json({ error: 'User must belong to a chapter' }, { status: 400 });
    }

    // Feature flag check: Query chapters table for feature_flags
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, feature_flags')
      .eq('id', profile.chapter_id)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // Check if recruitment_crm_enabled feature flag is enabled
    if (!isFeatureEnabled(chapter.feature_flags, 'recruitment_crm_enabled')) {
      return NextResponse.json({ error: 'Recruitment CRM feature is not enabled for this chapter' }, { status: 403 });
    }

    if (profile.role !== 'active_member' && profile.role !== 'admin' && profile.role !== 'governance') {
      return NextResponse.json({ error: 'Insufficient permissions. Only active members, admins, and governance can submit recruits.' }, { status: 403 });
    }

    // Parse and validate request body
    const body: CreateRecruitRequest = await request.json();
    const { name, hometown, phone_number, instagram_handle } = body;

    // Validation: name required (non-empty string)
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required and must be a non-empty string' }, { status: 400 });
    }

    // Validation: hometown required (non-empty string)
    if (!hometown || typeof hometown !== 'string' || hometown.trim().length === 0) {
      return NextResponse.json({ error: 'Hometown is required and must be a non-empty string' }, { status: 400 });
    }

    // Validation: phone_number optional (if provided, validate format)
    if (phone_number && typeof phone_number === 'string' && phone_number.trim().length > 0) {
      if (!isValidPhoneNumber(phone_number)) {
        return NextResponse.json({ error: 'Invalid phone number format. Please provide a valid 10 or 11 digit phone number.' }, { status: 400 });
      }
    }

    // Normalize Instagram handle (strip @ symbol if provided)
    const normalizedInstagramHandle = normalizeInstagramHandle(instagram_handle);

    // Prepare data for database insert
    const insertData = {
      chapter_id: profile.chapter_id,
      name: name.trim(),
      hometown: hometown.trim(),
      phone_number: phone_number?.trim() || null,
      instagram_handle: normalizedInstagramHandle || null,
      stage: 'New' as const,
      submitted_by: user.id,
      created_by: user.id,
    };

    // Insert into recruits table
    const { data: recruit, error: insertError } = await supabase
      .from('recruits')
      .insert([insertData])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating recruit:', insertError);
      return NextResponse.json({ 
        error: 'Failed to create recruit record',
        details: insertError.message 
      }, { status: 500 });
    }

    // Return created recruit with 201 status
    return NextResponse.json(recruit, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/recruitment/recruits:', error);
    
    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
