import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isFeatureEnabled } from '@/types/featureFlags';
import type { 
  CreateRecruitRequest, 
  BulkRecruitImportResult,
  BulkRecruitImportError,
  BulkRecruitImportDuplicate 
} from '@/types/recruitment';
import { EXECUTIVE_ROLES } from '@/lib/permissions';
import { getManagedChapterIds } from '@/lib/services/governanceService';

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
      return null;
    }
    
    return { user, supabase };
  } catch (cookieError) {
    console.error('Cookie auth exception:', cookieError);
    return null;
  }
}

// Check for duplicate recruits in the database
async function checkForDuplicate(
  supabase: any, 
  chapterId: string, 
  recruit: CreateRecruitRequest
): Promise<{ isDuplicate: boolean; existingId?: string; reason?: string }> {
  // Check by exact name match (case-insensitive)
  const { data: nameMatches } = await supabase
    .from('recruits')
    .select('id, name, phone_number, instagram_handle')
    .eq('chapter_id', chapterId)
    .ilike('name', recruit.name.trim());

  if (nameMatches && nameMatches.length > 0) {
    // If we have a phone number, check for phone match
    if (recruit.phone_number) {
      const cleanedPhone = recruit.phone_number.replace(/\D/g, '');
      const phoneMatch = nameMatches.find((r: any) => {
        if (!r.phone_number) return false;
        const existingPhone = r.phone_number.replace(/\D/g, '');
        return existingPhone === cleanedPhone;
      });
      if (phoneMatch) {
        return { 
          isDuplicate: true, 
          existingId: phoneMatch.id, 
          reason: 'Same name and phone number' 
        };
      }
    }

    // If we have an instagram handle, check for instagram match
    if (recruit.instagram_handle) {
      const normalizedHandle = normalizeInstagramHandle(recruit.instagram_handle)?.toLowerCase();
      const igMatch = nameMatches.find((r: any) => {
        if (!r.instagram_handle) return false;
        return r.instagram_handle.toLowerCase() === normalizedHandle;
      });
      if (igMatch) {
        return { 
          isDuplicate: true, 
          existingId: igMatch.id, 
          reason: 'Same name and Instagram handle' 
        };
      }
    }

    // If same name but no phone/instagram to compare, flag as potential duplicate
    // only if the name is an exact case-insensitive match
    const exactNameMatch = nameMatches.find(
      (r: any) => r.name.toLowerCase() === recruit.name.trim().toLowerCase()
    );
    if (exactNameMatch) {
      return { 
        isDuplicate: true, 
        existingId: exactNameMatch.id, 
        reason: 'Same name already exists' 
      };
    }
  }

  return { isDuplicate: false };
}

// Validate a single recruit record
function validateRecruit(recruit: CreateRecruitRequest, rowIndex: number): BulkRecruitImportError | null {
  // Name validation (required)
  if (!recruit.name || typeof recruit.name !== 'string' || recruit.name.trim().length === 0) {
    return { row: rowIndex, name: recruit.name || 'Unknown', error: 'Name is required' };
  }

  // Hometown validation (required)
  if (!recruit.hometown || typeof recruit.hometown !== 'string' || recruit.hometown.trim().length === 0) {
    return { row: rowIndex, name: recruit.name, error: 'Hometown is required' };
  }

  // Phone number validation (optional, but if provided must be valid)
  if (recruit.phone_number && recruit.phone_number.trim().length > 0) {
    if (!isValidPhoneNumber(recruit.phone_number)) {
      return { row: rowIndex, name: recruit.name, error: 'Invalid phone number format (must be 10 or 11 digits)' };
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
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

    // Feature flag check
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
      return NextResponse.json({ error: 'Recruitment CRM feature is not enabled for this chapter' }, { status: 403 });
    }

    let managedChapterIds: string[] | undefined;
    if (profile.role === 'governance') {
      managedChapterIds = await getManagedChapterIds(supabase, user.id);
    }
    const isAdmin = profile.role === 'admin';
    const isExec = profile.chapter_role && EXECUTIVE_ROLES.includes(profile.chapter_role as any);
    const canImportAsGovernance = profile.role === 'governance' && managedChapterIds?.includes(profile.chapter_id!);

    if (!isAdmin && !isExec && !canImportAsGovernance) {
      return NextResponse.json({
        error: 'Insufficient permissions. Only execs and admins can bulk import recruits.',
      }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { recruits, options = {} } = body;
    const { skipDuplicates = true, batchSize = 50 } = options;

    if (!Array.isArray(recruits) || recruits.length === 0) {
      return NextResponse.json({ error: 'No recruit data provided' }, { status: 400 });
    }

    // Limit to prevent abuse
    if (recruits.length > 1000) {
      return NextResponse.json({ 
        error: 'Too many records. Maximum 1000 recruits per import.' 
      }, { status: 400 });
    }

    // Initialize results
    const results: BulkRecruitImportResult = {
      total: recruits.length,
      successful: 0,
      failed: 0,
      duplicates: 0,
      errors: [],
      createdRecruits: [],
      skippedDuplicates: [],
    };

    // Process recruits in batches
    for (let i = 0; i < recruits.length; i += batchSize) {
      const batch = recruits.slice(i, i + batchSize);

      for (let j = 0; j < batch.length; j++) {
        const recruit = batch[j] as CreateRecruitRequest;
        const rowIndex = i + j + 2; // +2 for 1-indexed row + header row

        try {
          // Validate the recruit
          const validationError = validateRecruit(recruit, rowIndex);
          if (validationError) {
            results.failed++;
            results.errors.push(validationError);
            continue;
          }

          // Check for duplicates
          const duplicateCheck = await checkForDuplicate(supabase, profile.chapter_id, recruit);
          if (duplicateCheck.isDuplicate) {
            results.duplicates++;
            if (skipDuplicates) {
              results.skippedDuplicates.push({
                row: rowIndex,
                name: recruit.name,
                existingId: duplicateCheck.existingId!,
                reason: duplicateCheck.reason!,
              });
              continue;
            } else {
              // If not skipping duplicates, treat as error
              results.failed++;
              results.errors.push({
                row: rowIndex,
                name: recruit.name,
                error: `Duplicate: ${duplicateCheck.reason}`,
              });
              continue;
            }
          }

          // Prepare data for insert
          const insertData = {
            chapter_id: profile.chapter_id,
            name: recruit.name.trim(),
            hometown: recruit.hometown.trim(),
            phone_number: recruit.phone_number?.trim() || null,
            instagram_handle: normalizeInstagramHandle(recruit.instagram_handle) || null,
            stage: 'New' as const,
            submitted_by: user.id,
            created_by: user.id,
          };

          // Insert the recruit
          const { data: newRecruit, error: insertError } = await supabase
            .from('recruits')
            .insert([insertData])
            .select('id, name')
            .single();

          if (insertError) {
            results.failed++;
            results.errors.push({
              row: rowIndex,
              name: recruit.name,
              error: insertError.message || 'Failed to create recruit',
            });
          } else {
            results.successful++;
            results.createdRecruits.push({
              id: newRecruit.id,
              name: newRecruit.name,
            });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: rowIndex,
            name: recruit.name || 'Unknown',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Small delay between batches to avoid overwhelming the database
      if (i + batchSize < recruits.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Import completed. ${results.successful} recruits created successfully.`,
    });

  } catch (error) {
    console.error('Bulk import error:', error);
    
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

