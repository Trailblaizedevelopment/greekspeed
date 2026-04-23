import { supabase } from '@/lib/supabase/client';

export interface DocumentUploadData {
  title: string;
  description: string;
  documentType: string;
  visibility: string[];
  tags: string[];
  effectiveDate: string;
  expiresAt?: string;
  reviewBy?: string;
  file: File;
}

export interface UploadedDocument {
  id: string;
  title: string;
  description: string;
  file_url: string;
  storage_path: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  document_type: string;
  visibility: string[];
  tags: string[];
  effective_date: string;
  expires_at?: string;
  review_by?: string;
  owner_id: string;
  chapter_id: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export class DocumentUploadService {
  private supabaseClient = supabase;

  /**
   * Upload a document to Supabase Storage and create database record
   */
  async uploadDocument(uploadData: DocumentUploadData): Promise<UploadedDocument> {
    try {
      // Starting document upload...
      
      // 1. Get current user and chapter info
      const { data: { user }, error: userError } = await this.supabaseClient.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }
      // User authenticated

      const { data: profile, error: profileError } = await this.supabaseClient
        .from('profiles')
        .select('chapter_id, role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.chapter_id) {
        throw new Error('User profile or chapter not found');
      }
      // Profile found, chapter_id

      // 2. Validate file
      const validationError = this.validateFile(uploadData.file);
      if (validationError) {
        throw new Error(validationError);
      }
      // File validation passed

      // 3. Generate storage path
      const storagePath = await this.generateStoragePath(
        profile.chapter_id,
        uploadData.documentType,
        uploadData.file
      );
      // Generated storage path

      // 4. Upload file to Supabase Storage
      // Attempting to upload file to storage...
      const { data: uploadResult, error: uploadError } = await this.supabaseClient.storage
        .from('chapter-documents')
        .upload(storagePath, uploadData.file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ Storage upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }
      // File uploaded to storage successfully

      // 5. Get public URL (for viewing)
      const { data: urlData } = this.supabaseClient.storage
        .from('chapter-documents')
        .getPublicUrl(storagePath);
      // Generated public URL

      // 6. Create database record
      // Creating database record...
      const { data: document, error: dbError } = await this.supabaseClient
        .from('documents')
        .insert({
          title: uploadData.title,
          description: uploadData.description,
          file_url: urlData.publicUrl,
          storage_path: storagePath,
          file_type: uploadData.file.name.split('.').pop()?.toLowerCase(),
          file_size: uploadData.file.size,
          mime_type: uploadData.file.type,
          document_type: uploadData.documentType,
          visibility: uploadData.visibility,
          tags: uploadData.tags,
          effective_date: uploadData.effectiveDate,
          expires_at: uploadData.expiresAt || null,
          review_by: uploadData.reviewBy || null,
          owner_id: user.id,
          chapter_id: profile.chapter_id,
          is_active: true
        })
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database error:', dbError);
        // Clean up uploaded file if database insert fails
        await this.supabaseClient.storage
          .from('chapter-documents')
          .remove([storagePath]);
        throw new Error(`Database error: ${dbError.message}`);
      }
      // Database record created successfully

      return document as UploadedDocument;

    } catch (error) {
      console.error('❌ Document upload error:', error);
      throw error;
    }
  }

  /**
   * Generate organized storage path based on your folder structure
   */
  private async generateStoragePath(chapterId: string, documentType: string, file: File): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const sanitizedTitle = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    // Get the EXACT chapter name from database (don't sanitize it)
    const { data: chapter, error: chapterError } = await this.supabaseClient
      .from('spaces')
      .select('name')
      .eq('id', chapterId)
      .single();
    
    let chapterFolder: string;
    if (chapterError || !chapter?.name) {
      console.warn('Could not get chapter name, falling back to UUID');
      chapterFolder = chapterId;
    } else {
      // Use the EXACT name from database (no sanitization)
      chapterFolder = chapter.name;
      // Using exact chapter name
    }
    
    const typeFolderMap: Record<string, string> = {
      'bylaws': 'governance',
      'policy': 'governance',
      'meeting_minutes': 'governance',
      'budget': 'finance',
      'event_doc': 'events',
      'compliance': 'operations',
      'recruitment': 'recruitment',
      'alumni': 'alumni',
      'housing': 'facilities',
      'training': 'resources',
      'branding': 'marketing',
      'academics': 'academics',
      'other': 'miscellaneous'
    };

    const folderName = typeFolderMap[documentType] || 'miscellaneous';
    
    return `${chapterFolder}/${folderName}/${timestamp}_${uniqueId}_${sanitizedTitle}`;
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: File): string | null {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];

    if (file.size > maxSize) {
      return 'File size must be less than 5MB';
    }

    if (!allowedTypes.includes(file.type)) {
      return 'Only PDF, DOCX, XLSX, and PPTX files are allowed';
    }

    return null;
  }

  /**
   * Delete a document and its file
   */
  async deleteDocument(documentId: string): Promise<void> {
    try {
      // Get document info first
      const { data: document, error: fetchError } = await this.supabaseClient
        .from('documents')
        .select('storage_path, owner_id')
        .eq('id', documentId)
        .single();

      if (fetchError || !document) {
        throw new Error('Document not found');
      }

      // Check ownership
      const { data: { user } } = await this.supabaseClient.auth.getUser();
      if (user?.id !== document.owner_id) {
        throw new Error('Unauthorized to delete this document');
      }

      // Delete from storage
      if (document.storage_path) {
        await this.supabaseClient.storage
          .from('chapter-documents')
          .remove([document.storage_path]);
      }

      // Delete from database
      const { error: deleteError } = await this.supabaseClient
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (deleteError) {
        throw new Error(`Failed to delete document: ${deleteError.message}`);
      }

    } catch (error) {
      console.error('Document deletion error:', error);
      throw error;
    }
  }
}

export const documentUploadService = new DocumentUploadService();
