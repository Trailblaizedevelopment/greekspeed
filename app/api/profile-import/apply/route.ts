import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { LinkedInImportService } from '@/lib/services/linkedinInImportService';
import { ImportReviewFormInput } from '@/types/profile-import';
import { deriveWorkStateCodeFromLocationText } from '@/lib/alumni/workStateCode';

/**
 * POST /api/profile-import/apply
 * 
 * Applies parsed/edited data to the user's profile.
 * - For alumni: Updates alumni table with job/company info
 * - For active members: Updates profiles table with education info
 * Called after user reviews and confirms the imported data.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'No authorization header' },
        { status: 401 }
      );
    }

    // 2. Create server-side Supabase client (uses service role key, bypasses RLS)
    const supabase = createServerSupabaseClient();
    
    // 3. Verify authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 4. Create service instance with server client (important for RLS bypass)
    const importService = new LinkedInImportService(supabase);

    // 5. Get request body
    const body = await request.json();
    const { importId, formData } = body as { 
      importId: string; 
      formData: ImportReviewFormInput;
    };
    
    if (!importId) {
      return NextResponse.json(
        { error: 'Import ID is required' },
        { status: 400 }
      );
    }

    if (!formData) {
      return NextResponse.json(
        { error: 'Form data is required' },
        { status: 400 }
      );
    }

    // 6. Verify user owns this import
    const importRecord = await importService.getImport(importId);
    
    if (!importRecord) {
      return NextResponse.json(
        { error: 'Import not found' },
        { status: 404 }
      );
    }
    
    if (importRecord.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized to access this import' },
        { status: 403 }
      );
    }

    // 7. Get user profile to check role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, chapter_id, chapter')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    // 8. Build profile updates based on user role
    const profileUpdates: Record<string, unknown> = {
      location: formData.location || null,
      updated_at: new Date().toISOString(),
    };

    // For non-alumni (active members), also save education data to profiles
    if (profile.role !== 'alumni') {
      // Map field of study to major
      if (formData.education?.field) {
        profileUpdates.major = formData.education.field;
      }
      // Map graduation year
      if (formData.education?.graduationYear) {
        profileUpdates.grad_year = parseInt(formData.education.graduationYear);
      }
    }

    // Update profiles table
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', user.id);

    if (profileUpdateError) {
      console.error('Profile update error:', profileUpdateError);
    }

    // 9. Update alumni table if user is alumni
    if (profile.role === 'alumni') {
      const graduationYear = formData.education?.graduationYear 
        ? parseInt(formData.education.graduationYear) 
        : new Date().getFullYear();

      const { error: alumniError } = await supabase
        .from('alumni')
        .update({
          company: formData.currentExperience?.company || 'Not specified',
          job_title: formData.currentExperience?.title || 'Not specified',
          industry: formData.industry || 'Not specified',
          location: formData.location || 'Not specified',
          work_state_code: deriveWorkStateCodeFromLocationText(formData.location ?? null),
          graduation_year: graduationYear,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (alumniError) {
        console.error('Alumni update error:', alumniError);
        return NextResponse.json(
          { error: `Failed to update alumni record: ${alumniError.message}` },
          { status: 500 }
        );
      }
    }

    // 10. Update import record status to applied
    await importService.updateImportStatus(importId, 'applied', {
      applied_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
    });

  } catch (error) {
    console.error('Apply API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
