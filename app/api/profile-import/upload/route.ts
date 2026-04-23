import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/client';
import { ImportSource } from '@/types/profile-import';

/**
 * POST /api/profile-import/upload
 * 
 * Uploads a PDF file and creates an import record.
 * Uses FormData for file upload.
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

    // 2. Verify authentication
    const supabase = createServerSupabaseClient();
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 3. Get user profile for chapter info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('chapter_id, chapter')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // 4. Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const source = (formData.get('source') as ImportSource) || 'linkedin_pdf';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // 5. Validate file
    const maxSize = 15 * 1024 * 1024; // 15MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 15MB' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      );
    }

    // 6. Generate storage path
    const timestamp = new Date().toISOString().split('T')[0];
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    let chapterFolder = 'unassigned';
    if (profile.chapter_id) {
      const { data: chapter } = await supabase
        .from('spaces')
        .select('name')
        .eq('id', profile.chapter_id)
        .single();
      chapterFolder = chapter?.name || profile.chapter_id;
    }
    
    const storagePath = `${chapterFolder}/${user.id}/${timestamp}_${uniqueId}_${sanitizedFilename}`;

    // 7. Upload to storage
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('profile-imports')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 8. Generate signed URL
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('profile-imports')
      .createSignedUrl(storagePath, 3600);

    if (signedUrlError) {
      // Clean up uploaded file
      await supabase.storage.from('profile-imports').remove([storagePath]);
      return NextResponse.json(
        { error: 'Failed to generate signed URL' },
        { status: 500 }
      );
    }

    // 9. Create import record
    const { data: importRecord, error: dbError } = await supabase
      .from('profile_imports')
      .insert({
        user_id: user.id,
        source,
        file_path: storagePath,
        original_filename: file.name,
        file_size_bytes: file.size,
        status: 'pending',
        parser_version: 'v1',
      })
      .select()
      .single();

    if (dbError) {
      // Clean up uploaded file
      await supabase.storage.from('profile-imports').remove([storagePath]);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      import: importRecord,
      signedUrl: signedUrlData.signedUrl,
    });

  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
