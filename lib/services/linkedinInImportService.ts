import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import {
  ProfileImport,
  ImportSource,
  ImportStatus,
  ParsedLinkedInData,
  ImportConfidence,
} from '@/types/profile-import';

// ============================================================================
// LinkedIn Import Service
// Handles PDF upload, storage, and import record management
// ============================================================================

export interface LinkedInUploadData {
  file: File;
  source: ImportSource;
}

export interface UploadResult {
  success: boolean;
  import: ProfileImport;
  signedUrl: string;
  error?: string;
}

export interface ExtractionResult {
  success: boolean;
  text: string;
  pageCount: number;
  error?: string;
}

export class LinkedInImportService {
  private supabaseClient: SupabaseClient;
  private bucketName = 'profile-imports';

  /**
   * Create a new LinkedInImportService instance
   * @param client - Optional Supabase client. If not provided, uses the default browser client.
   *                 For server-side API routes, pass the server client to bypass RLS.
   */
  constructor(client?: SupabaseClient) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.supabaseClient = (client || supabase) as SupabaseClient;
  }

  // ==========================================================================
  // Main Upload Method
  // ==========================================================================

  /**
   * Upload a LinkedIn PDF and create an import record
   */
  async uploadLinkedInPdf(uploadData: LinkedInUploadData): Promise<UploadResult> {
    try {
      // 1. Get current user and profile info
      const { data: { user }, error: userError } = await this.supabaseClient.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const { data: profile, error: profileError } = await this.supabaseClient
        .from('profiles')
        .select('chapter_id, chapter, full_name')
        .eq('id', user.id)
        .single();

      if (profileError) {
        throw new Error('User profile not found');
      }

      // 2. Validate file
      const validationError = this.validateFile(uploadData.file);
      if (validationError) {
        throw new Error(validationError);
      }

      // 3. Generate storage path: {chapter_name}/{user_id}/{timestamp}_{uniqueId}_{filename}.pdf
      const storagePath = await this.generateStoragePath(
        user.id,
        profile.chapter_id,
        uploadData.file.name
      );

      // 4. Upload file to Supabase Storage
      const { data: uploadResult, error: uploadError } = await this.supabaseClient.storage
        .from(this.bucketName)
        .upload(storagePath, uploadData.file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 5. Generate signed URL (1-hour expiry for private bucket)
      const { data: signedUrlData, error: signedUrlError } = await this.supabaseClient.storage
        .from(this.bucketName)
        .createSignedUrl(storagePath, 3600); // 1 hour

      if (signedUrlError) {
        console.error('Signed URL error:', signedUrlError);
        // Clean up uploaded file
        await this.supabaseClient.storage.from(this.bucketName).remove([storagePath]);
        throw new Error('Failed to generate signed URL');
      }

      // 6. Create profile_imports database record
      const { data: importRecord, error: dbError } = await this.supabaseClient
        .from('profile_imports')
        .insert({
          user_id: user.id,
          source: uploadData.source,
          file_path: storagePath,
          original_filename: uploadData.file.name,
          file_size_bytes: uploadData.file.size,
          status: 'pending' as ImportStatus,
          parser_version: 'v1',
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        // Clean up uploaded file if database insert fails
        await this.supabaseClient.storage.from(this.bucketName).remove([storagePath]);
        throw new Error(`Database error: ${dbError.message}`);
      }

      return {
        success: true,
        import: importRecord as ProfileImport,
        signedUrl: signedUrlData.signedUrl,
      };

    } catch (error) {
      console.error('LinkedIn PDF upload error:', error);
      throw error;
    }
  }

  // ==========================================================================
  // File Validation
  // ==========================================================================

  /**
   * Validate uploaded file (PDF only, max 15MB)
   */
  private validateFile(file: File): string | null {
    const maxSize = 15 * 1024 * 1024; // 15MB
    const allowedTypes = ['application/pdf'];

    if (!file) {
      return 'No file provided';
    }

    if (file.size > maxSize) {
      return 'File size must be less than 15MB';
    }

    if (!allowedTypes.includes(file.type)) {
      return 'Only PDF files are allowed';
    }

    // Check file extension as backup validation
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'pdf') {
      return 'File must have .pdf extension';
    }

    return null;
  }

  // ==========================================================================
  // Storage Path Generation
  // ==========================================================================

  /**
   * Generate organized storage path: {chapter_name}/{user_id}/{timestamp}_{uniqueId}_{filename}.pdf
   */
  private async generateStoragePath(
    userId: string,
    chapterId: string | null,
    filename: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

    // Get chapter name for folder organization
    let chapterFolder = 'unassigned';

    if (chapterId) {
      const { data: chapter, error: chapterError } = await this.supabaseClient
        .from('spaces')
        .select('name')
        .eq('id', chapterId)
        .single();

      if (!chapterError && chapter?.name) {
        chapterFolder = chapter.name;
      } else {
        // Fallback to chapter ID if name lookup fails
        chapterFolder = chapterId;
      }
    }

    return `${chapterFolder}/${userId}/${timestamp}_${uniqueId}_${sanitizedFilename}`;
  }

  // ==========================================================================
  // Import Record Management
  // ==========================================================================

  /**
   * Update import record status
   */
  async updateImportStatus(
    importId: string,
    status: ImportStatus,
    additionalData?: {
      parsed_json?: ParsedLinkedInData;
      confidence_json?: ImportConfidence;
      error_message?: string;
      applied_at?: string;
    }
  ): Promise<ProfileImport> {
    const { data, error } = await this.supabaseClient
      .from('profile_imports')
      .update({
        status,
        ...additionalData,
      })
      .eq('id', importId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update import status: ${error.message}`);
    }

    return data as ProfileImport;
  }

  /**
   * Get import record by ID
   */
  async getImport(importId: string): Promise<ProfileImport | null> {
    const { data, error } = await this.supabaseClient
      .from('profile_imports')
      .select('*')
      .eq('id', importId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get import: ${error.message}`);
    }

    return data as ProfileImport;
  }

  /**
   * Get the latest import for a user
   */
  async getLatestImport(userId: string): Promise<ProfileImport | null> {
    const { data, error } = await this.supabaseClient
      .from('profile_imports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get latest import: ${error.message}`);
    }

    return data as ProfileImport;
  }

  /**
   * Get a fresh signed URL for an existing import's file
   */
  async getSignedUrl(importId: string, expiresIn: number = 3600): Promise<string | null> {
    const importRecord = await this.getImport(importId);

    if (!importRecord?.file_path) {
      return null;
    }

    const { data, error } = await this.supabaseClient.storage
      .from(this.bucketName)
      .createSignedUrl(importRecord.file_path, expiresIn);

    if (error) {
      console.error('Failed to generate signed URL:', error);
      return null;
    }

    return data.signedUrl;
  }

  /**
   * Mark import as skipped (user chose manual entry)
   */
  async skipImport(userId: string): Promise<ProfileImport> {
    const { data, error } = await this.supabaseClient
      .from('profile_imports')
      .insert({
        user_id: userId,
        source: 'manual' as ImportSource,
        status: 'skipped' as ImportStatus,
        parser_version: 'v1',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create skip record: ${error.message}`);
    }

    return data as ProfileImport;
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Delete an import record and its associated file
   */
  async deleteImport(importId: string): Promise<void> {
    // Get import record
    const importRecord = await this.getImport(importId);

    if (!importRecord) {
      throw new Error('Import not found');
    }

    // Verify ownership
    const { data: { user } } = await this.supabaseClient.auth.getUser();
    if (user?.id !== importRecord.user_id) {
      throw new Error('Unauthorized to delete this import');
    }

    // Delete file from storage if exists
    if (importRecord.file_path) {
      await this.supabaseClient.storage
        .from(this.bucketName)
        .remove([importRecord.file_path]);
    }

    // Delete database record
    const { error } = await this.supabaseClient
      .from('profile_imports')
      .delete()
      .eq('id', importId);

    if (error) {
      throw new Error(`Failed to delete import: ${error.message}`);
    }
  }

  // ==========================================================================
  // PDF Text Extraction (Server-side only)
  // ==========================================================================

  /**
   * Download PDF from storage and return as Buffer
   * This method should be called from an API route
   */
  async downloadPdfAsBuffer(importId: string): Promise<Buffer> {
    const importRecord = await this.getImport(importId);

    if (!importRecord?.file_path) {
      throw new Error('Import record or file path not found');
    }

    const { data, error } = await this.supabaseClient.storage
      .from(this.bucketName)
      .download(importRecord.file_path);

    if (error) {
      throw new Error(`Failed to download PDF: ${error.message}`);
    }

    // Convert Blob to Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Extract text from PDF buffer using pdf-parse
   * NOTE: This is meant to be called from a server-side API route
   * where pdf-parse is available
   */
  async extractTextFromPdf(pdfBuffer: Buffer): Promise<ExtractionResult> {
    try {
      // pdf-parse 1.1.1 has a simple API
      const pdfParse = require('pdf-parse/lib/pdf-parse');

      const data = await pdfParse(pdfBuffer);

      return {
        success: true,
        text: data.text || '',
        pageCount: data.numpages || 0,
      };
    } catch (error) {
      console.error('PDF extraction error:', error);
      return {
        success: false,
        text: '',
        pageCount: 0,
        error: error instanceof Error ? error.message : 'Failed to extract text from PDF',
      };
    }
  }

  /**
   * Full extraction pipeline: download from storage + extract text
   * Should be called from API route only
   */
  async extractTextFromImport(importId: string): Promise<ExtractionResult> {
    try {
      // Update status to processing
      await this.updateImportStatus(importId, 'processing');

      // Download PDF
      const pdfBuffer = await this.downloadPdfAsBuffer(importId);

      // Extract text
      const result = await this.extractTextFromPdf(pdfBuffer);

      if (!result.success) {
        // Update status to failed
        await this.updateImportStatus(importId, 'failed', {
          error_message: result.error || 'Text extraction failed',
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';

      // Update status to failed
      try {
        await this.updateImportStatus(importId, 'failed', {
          error_message: errorMessage,
        });
      } catch (updateError) {
        console.error('Failed to update import status:', updateError);
      }

      return {
        success: false,
        text: '',
        pageCount: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Validate extracted text looks like a LinkedIn PDF
   */
  validateLinkedInPdfContent(text: string): { valid: boolean; reason?: string } {
    // Check for common LinkedIn PDF markers
    const markers = [
      'Experience',
      'Education',
      'linkedin.com',
      'Page 1 of',
    ];

    const foundMarkers = markers.filter(marker =>
      text.toLowerCase().includes(marker.toLowerCase())
    );

    if (foundMarkers.length === 0) {
      return {
        valid: false,
        reason: 'This doesn\'t appear to be a LinkedIn profile PDF. Please download your profile from LinkedIn using "More" → "Save to PDF".',
      };
    }

    // Check minimum content length
    if (text.length < 200) {
      return {
        valid: false,
        reason: 'The PDF appears to be empty or too short. Please try downloading your LinkedIn profile again.',
      };
    }

    return { valid: true };
  }

  // ==========================================================================
  // Combined Extract + Parse (for API convenience)
  // ==========================================================================

  /**
   * Full pipeline: extract text from PDF and parse into structured data
   * Should be called from API route only
   */
  async extractAndParse(importId: string): Promise<{
    success: boolean;
    data?: import('@/types/profile-import').ParsedLinkedInData;
    confidence?: import('@/types/profile-import').ImportConfidence;
    error?: string;
  }> {
    try {
      // Extract text
      const extractionResult = await this.extractTextFromImport(importId);

      if (!extractionResult.success) {
        return {
          success: false,
          error: extractionResult.error || 'Text extraction failed',
        };
      }

      // Validate content
      const validation = this.validateLinkedInPdfContent(extractionResult.text);
      if (!validation.valid) {
        await this.updateImportStatus(importId, 'failed', {
          error_message: validation.reason,
        });
        return {
          success: false,
          error: validation.reason,
        };
      }

      // Parse the text
      const { parseLinkedInPdf } = await import('@/lib/services/linkedInPdfParser');
      const parseResult = parseLinkedInPdf(extractionResult.text);

      // Update import record
      await this.updateImportStatus(importId, 'needs_review', {
        parsed_json: parseResult.data,
        confidence_json: parseResult.confidence,
      });

      return {
        success: true,
        data: parseResult.data,
        confidence: parseResult.confidence,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      try {
        await this.updateImportStatus(importId, 'failed', {
          error_message: errorMessage,
        });
      } catch (updateError) {
        console.error('Failed to update import status:', updateError);
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

// Export singleton instance
export const linkedInImportService = new LinkedInImportService();