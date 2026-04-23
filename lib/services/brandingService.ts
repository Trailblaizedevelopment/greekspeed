import { supabase } from '@/lib/supabase/client';
import type { ChapterBranding, BrandingTheme } from '@/types/branding';
import { brandingToTheme, DEFAULT_BRANDING_THEME } from '@/types/branding';

/**
 * Branding Service
 * 
 * Handles fetching and resolving chapter branding with fallback chain:
 * 1. Chapter-specific branding
 * 2. Organization-level branding
 * 3. Default Trailblaize branding
 */
export class BrandingService {
  /**
   * Get chapter-specific branding configuration
   * 
   * @param chapterId - UUID of the chapter
   * @returns ChapterBranding record or null if not found
   */
  static async getChapterBranding(chapterId: string): Promise<ChapterBranding | null> {
    try {
      if (!chapterId) {
        console.warn('BrandingService: No chapterId provided');
        return null;
      }

      const { data, error } = await supabase
        .from('chapter_branding')
        .select('*')
        .eq('chapter_id', chapterId)
        .maybeSingle();

      if (error) {
        console.error('BrandingService: Error fetching chapter branding:', error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error('BrandingService: Exception in getChapterBranding:', error);
      return null;
    }
  }

  /**
   * Get organization-level branding configuration
   * 
   * Organization branding can be reused across multiple chapters of the same
   * national fraternity/organization.
   * 
   * @param orgId - Organization identifier (matches national_fraternity field)
   * @returns ChapterBranding record or null if not found
   */
  static async getOrganizationBranding(orgId: string): Promise<ChapterBranding | null> {
    try {
      if (!orgId) {
        console.warn('BrandingService: No orgId provided');
        return null;
      }

      const { data, error } = await supabase
        .from('chapter_branding')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error) {
        // PGRST116 is "not found" error - this is expected if no branding exists
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('BrandingService: Error fetching organization branding:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('BrandingService: Exception in getOrganizationBranding:', error);
      return null;
    }
  }

  /**
   * Resolve branding for a chapter with fallback chain
   * 
   * Fallback order:
   * 1. Chapter-specific branding (if exists)
   * 2. Organization-level branding (based on chapter's national_fraternity)
   * 3. Default Trailblaize branding
   * 
   * @param chapterId - UUID of the chapter
   * @returns BrandingTheme object (never null - always returns at least default theme)
   */
  static async resolveBrandingForChapter(chapterId: string): Promise<BrandingTheme> {
    try {
      if (!chapterId) {
        console.warn('BrandingService: No chapterId provided, using default theme');
        return DEFAULT_BRANDING_THEME;
      }

      // Step 1: Get chapter information to find national_fraternity
      const { data: chapter, error: chapterError } = await supabase
        .from('spaces')
        .select('id, national_fraternity')
        .eq('id', chapterId)
        .single();

      if (chapterError || !chapter) {
        console.warn(`BrandingService: Chapter ${chapterId} not found, using default theme`);
        return DEFAULT_BRANDING_THEME;
      }

      // Step 2: Try chapter-specific branding first
      const chapterBranding = await this.getChapterBranding(chapterId);
      if (chapterBranding) {
        console.log(`BrandingService: Found chapter-specific branding for ${chapterId}`);
        return brandingToTheme(chapterBranding);
      }

      // Step 3: Try organization-level branding
      if (chapter.national_fraternity) {
        const orgBranding = await this.getOrganizationBranding(chapter.national_fraternity);
        if (orgBranding) {
          console.log(`BrandingService: Found organization branding for ${chapter.national_fraternity}`);
          return brandingToTheme(orgBranding);
        }
      }

      // Step 4: Fall back to default Trailblaize branding
      console.log(`BrandingService: No branding found, using default theme for chapter ${chapterId}`);
      return DEFAULT_BRANDING_THEME;
    } catch (error) {
      console.error('BrandingService: Exception in resolveBrandingForChapter:', error);
      // Always return default theme on error to prevent UI breaking
      return DEFAULT_BRANDING_THEME;
    }
  }

  /**
   * Get branding for multiple chapters efficiently
   * 
   * Useful for admin interfaces that need to display branding status
   * for multiple chapters at once.
   * 
   * @param chapterIds - Array of chapter UUIDs
   * @returns Map of chapterId to BrandingTheme
   */
  static async getBrandingForChapters(chapterIds: string[]): Promise<Map<string, BrandingTheme>> {
    const brandingMap = new Map<string, BrandingTheme>();

    try {
      if (!chapterIds || chapterIds.length === 0) {
        return brandingMap;
      }

      // Fetch all chapter branding records in one query
      const { data: brandingRecords, error } = await supabase
        .from('chapter_branding')
        .select('*')
        .in('chapter_id', chapterIds);

      if (error) {
        console.error('BrandingService: Error fetching multiple chapter branding:', error);
        // Return map with default themes for all chapters
        chapterIds.forEach(id => brandingMap.set(id, DEFAULT_BRANDING_THEME));
        return brandingMap;
      }

      // Process each chapter
      for (const chapterId of chapterIds) {
        const chapterBranding = brandingRecords?.find(b => b.chapter_id === chapterId);
        
        if (chapterBranding) {
          brandingMap.set(chapterId, brandingToTheme(chapterBranding));
        } else {
          // For chapters without branding, resolve with fallback chain
          const theme = await this.resolveBrandingForChapter(chapterId);
          brandingMap.set(chapterId, theme);
        }
      }

      return brandingMap;
    } catch (error) {
      console.error('BrandingService: Exception in getBrandingForChapters:', error);
      // Return map with default themes for all chapters on error
      chapterIds.forEach(id => brandingMap.set(id, DEFAULT_BRANDING_THEME));
      return brandingMap;
    }
  }
}

