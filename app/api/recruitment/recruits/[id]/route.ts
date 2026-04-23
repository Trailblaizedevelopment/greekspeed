import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isFeatureEnabled } from '@/types/featureFlags';
import type { UpdateRecruitRequest, RecruitStage } from '@/types/recruitment';
import { canManageMembersForContext } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

// Valid RecruitStage values
const VALID_STAGES: RecruitStage[] = ['New', 'Contacted', 'Event Invite', 'Bid Given', 'Accepted', 'Declined'];

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get recruit ID from route parameters
    const { id: recruitId } = await params;

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
      .from('spaces')
      .select('id, feature_flags')
      .eq('id', profile.chapter_id)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // Check if recruitment_crm_enabled feature flag is enabled
    if (!isFeatureEnabled(chapter.feature_flags, 'recruitment_crm_enabled')) {
      return NextResponse.json({ 
        error: 'Recruitment CRM feature is not enabled for this chapter' 
      }, { status: 403 });
    }

    const { data: existingRecruit, error: recruitError } = await supabase
      .from('recruits')
      .select('id, chapter_id, stage')
      .eq('id', recruitId)
      .single();

    if (recruitError || !existingRecruit) {
      return NextResponse.json({ error: 'Recruit not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    const canManage = canManageMembersForContext(
      profile,
      existingRecruit.chapter_id,
      managedChapterIds
    );

    if (!canManage) {
      return NextResponse.json({
        error: 'Insufficient permissions or recruit belongs to a different chapter.',
      }, { status: 403 });
    }

    // Parse and validate request body
    const body: UpdateRecruitRequest = await request.json();

    // Build update object with only provided fields
    const updateData: any = {};

    // Validate and add name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ 
          error: 'Name must be a non-empty string' 
        }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    // Validate and add hometown if provided
    if (body.hometown !== undefined) {
      if (typeof body.hometown !== 'string' || body.hometown.trim().length === 0) {
        return NextResponse.json({ 
          error: 'Hometown must be a non-empty string' 
        }, { status: 400 });
      }
      updateData.hometown = body.hometown.trim();
    }

    // Validate and add phone_number if provided
    if (body.phone_number !== undefined) {
      if (body.phone_number === null || body.phone_number === '') {
        updateData.phone_number = null;
      } else if (typeof body.phone_number === 'string' && body.phone_number.trim().length > 0) {
        if (!isValidPhoneNumber(body.phone_number)) {
          return NextResponse.json({ 
            error: 'Invalid phone number format. Please provide a valid 10 or 11 digit phone number.' 
          }, { status: 400 });
        }
        updateData.phone_number = body.phone_number.trim();
      } else {
        return NextResponse.json({ 
          error: 'Phone number must be a string or null' 
        }, { status: 400 });
      }
    }

    // Validate and add instagram_handle if provided
    if (body.instagram_handle !== undefined) {
      if (body.instagram_handle === null || body.instagram_handle === '') {
        updateData.instagram_handle = null;
      } else {
        const normalized = normalizeInstagramHandle(body.instagram_handle);
        updateData.instagram_handle = normalized || null;
      }
    }

    // Validate and add stage if provided
    if (body.stage !== undefined) {
      if (!VALID_STAGES.includes(body.stage)) {
        return NextResponse.json({ 
          error: `Invalid stage value. Must be one of: ${VALID_STAGES.join(', ')}` 
        }, { status: 400 });
      }
      updateData.stage = body.stage;
    }

    // Add notes if provided (exec-only field)
    if (body.notes !== undefined) {
      updateData.notes = body.notes === null || body.notes === '' ? null : body.notes.trim();
    }

    // Ensure we have at least one field to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ 
        error: 'No fields provided to update' 
      }, { status: 400 });
    }

    // Set updated_at timestamp
    updateData.updated_at = new Date().toISOString();

    // Update recruit in database with chapter scoping
    const { data: updatedRecruit, error: updateError } = await supabase
      .from('recruits')
      .update(updateData)
      .eq('id', recruitId)
      .eq('chapter_id', profile.chapter_id) // Ensure chapter scoping
      .select()
      .single();

    if (updateError) {
      console.error('Error updating recruit:', updateError);
      return NextResponse.json({ 
        error: 'Failed to update recruit',
        details: updateError.message 
      }, { status: 500 });
    }

    if (!updatedRecruit) {
      return NextResponse.json({ error: 'Recruit not found after update' }, { status: 404 });
    }

    // Return updated recruit with 200 status
    return NextResponse.json(updatedRecruit, { status: 200 });

  } catch (error) {
    console.error('Error in PATCH /api/recruitment/recruits/[id]:', error);
    
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get recruit ID from route parameters
    const { id: recruitId } = await params;

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
      .from('spaces')
      .select('id, feature_flags')
      .eq('id', profile.chapter_id)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // Check if recruitment_crm_enabled feature flag is enabled
    if (!isFeatureEnabled(chapter.feature_flags, 'recruitment_crm_enabled')) {
      return NextResponse.json({ 
        error: 'Recruitment CRM feature is not enabled for this chapter' 
      }, { status: 403 });
    }

    const { data: existingRecruit, error: recruitError } = await supabase
      .from('recruits')
      .select('id, chapter_id')
      .eq('id', recruitId)
      .single();

    if (recruitError || !existingRecruit) {
      return NextResponse.json({ error: 'Recruit not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    const canManage = canManageMembersForContext(
      profile,
      existingRecruit.chapter_id,
      managedChapterIds
    );

    if (!canManage) {
      return NextResponse.json({
        error: 'Insufficient permissions or recruit belongs to a different chapter.',
      }, { status: 403 });
    }


    // Delete recruit from database with chapter scoping
    const { error: deleteError } = await supabase
      .from('recruits')
      .delete()
      .eq('id', recruitId)
      .eq('chapter_id', profile.chapter_id); // Ensure chapter scoping

    if (deleteError) {
      console.error('Error deleting recruit:', deleteError);
      return NextResponse.json({ 
        error: 'Failed to delete recruit',
        details: deleteError.message 
      }, { status: 500 });
    }

    // Return success response
    return NextResponse.json({ 
      success: true,
      message: 'Recruit deleted successfully' 
    }, { status: 200 });

  } catch (error) {
    console.error('Error in DELETE /api/recruitment/recruits/[id]:', error);
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
