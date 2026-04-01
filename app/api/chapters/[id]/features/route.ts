import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_FEATURE_FLAGS,
  VALID_FEATURE_FLAGS,
} from '@/types/featureFlags';
import type { ChapterFeatureFlags } from '@/types/featureFlags';
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { canManageChapterForContext } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

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
    
    // Fall back to cookies - use cookies() from next/headers (same as tasks route)
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
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

// GET: Read feature flags for a chapter
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { user, supabase } = auth;
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role, is_developer')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    const isChapterMember = profile.chapter_id === id;
    const canManage = 
      profile.role === 'admin' ||
      profile.is_developer || 
      canManageChapterForContext(profile, id, managedChapterIds);

    if (!canManage && !canManage) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Fetch chapter with feature_flags
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, feature_flags')
      .eq('id', id)
      .single();
    
    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }
    
    // Return flags (should already have defaults from database, but ensure it's never null)
    return NextResponse.json({
      feature_flags: chapter.feature_flags || DEFAULT_FEATURE_FLAGS,
    });
    
  } catch (error) {
    console.error('Feature flags GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Update feature flags for a chapter
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { user, supabase } = auth;
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter_role, is_developer')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    const canUpdate =
      profile.role === 'admin' ||
      profile.is_developer ||
      canManageChapterForContext(profile, id, managedChapterIds);

    if (!canUpdate) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    // Validate chapter exists and get current flags
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, feature_flags')
      .eq('id', id)
      .single();
    
    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }
    
    const body = await request.json();
    const { feature_flags } = body;
    
    if (!feature_flags || typeof feature_flags !== 'object') {
      return NextResponse.json({ error: 'feature_flags must be an object' }, { status: 400 });
    }
    
    // ✅ CRITICAL: Fetch existing flags first, then merge
    const existingFlags = (chapter.feature_flags || {}) as ChapterFeatureFlags;
    
    // ✅ Merge existing with new flags (new flags take precedence)
    const mergedFlags: ChapterFeatureFlags = {
      ...existingFlags,
      ...feature_flags
    };
    
    // Validate flag values are booleans and only valid flags are present
    for (const [key, value] of Object.entries(mergedFlags)) {
      if (!VALID_FEATURE_FLAGS.includes(key as any)) {
        return NextResponse.json({ error: `Invalid flag: ${key}` }, { status: 400 });
      }
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: `Flag ${key} must be a boolean` }, { status: 400 });
      }
    }
    
    // ✅ Update with merged flags
    const { data: updatedChapter, error: updateError } = await supabase
      .from('chapters')
      .update({
        feature_flags: mergedFlags,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, feature_flags')
      .single();
    
    if (updateError) {
      console.error('Feature flags update error:', updateError);
      return NextResponse.json({ error: 'Failed to update feature flags' }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      feature_flags: updatedChapter.feature_flags || DEFAULT_FEATURE_FLAGS,
    });
    
  } catch (error) {
    console.error('Feature flags PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}