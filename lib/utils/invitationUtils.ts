import { createServerSupabaseClient } from '@/lib/supabase/client';
import { Invitation, InvitationUsage, InvitationValidationResult } from '@/types/invitations';
import { getBaseUrl } from '@/lib/utils/urlUtils';

/**
 * Generate a secure random token for invitations
 */
export function generateInvitationToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Validate if an email domain is in the allowlist
 * NOTE: Currently disabled - all email domains are allowed
 */
export function validateEmailDomain(email: string, allowlist: string[] | null): boolean {
  // Always allow all email domains - no restrictions
  return true;
}

/**
 * Check if an invitation is expired
 */
export function isInvitationExpired(invitation: Invitation): boolean {
  if (!invitation.expires_at) {
    return false; // No expiration
  }
  
  const expiresAt = new Date(invitation.expires_at);
  const now = new Date();
  return now > expiresAt;
}

/**
 * Check if an invitation has reached its usage limit
 */
export function isInvitationAtLimit(invitation: Invitation): boolean {
  if (invitation.max_uses === null) {
    return false; // No limit
  }
  
  return invitation.usage_count >= invitation.max_uses;
}

/**
 * Validate an invitation token and return the invitation if valid
 */
export async function validateInvitationToken(token: string): Promise<InvitationValidationResult> {
  try {
    const supabase = createServerSupabaseClient();
    
    // Fetch the invitation with chapter info
    const { data: invitation, error } = await supabase
      .from('invitations')
      .select(`
        *,
        chapters!inner(name)
      `)
      .eq('token', token)
      .eq('is_active', true)
      .single();
    
    if (error || !invitation) {
      return {
        valid: false,
        error: 'Invalid or expired invitation link'
      };
    }
    
    // Check if expired
    if (isInvitationExpired(invitation)) {
      return {
        valid: false,
        error: 'This invitation has expired'
      };
    }
    
    // Check if at usage limit
    if (isInvitationAtLimit(invitation)) {
      return {
        valid: false,
        error: 'This invitation has reached its usage limit'
      };
    }
    
    return {
      valid: true,
      invitation,
      chapter_name: invitation.chapters?.name
    };
  } catch (error) {
    console.error('Error validating invitation token:', error);
    return {
      valid: false,
      error: 'Failed to validate invitation'
    };
  }
}

/**
 * Check if an email has already used a specific invitation
 */
export async function hasEmailUsedInvitation(invitationId: string, email: string): Promise<boolean> {
  try {
    const supabase = createServerSupabaseClient();
    
    const { data, error } = await supabase
      .from('invitation_usage')
      .select('id')
      .eq('invitation_id', invitationId)
      .eq('email', email.toLowerCase())
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }
    
    return !!data;
  } catch (error) {
    console.error('Error checking invitation usage:', error);
    return false; // Default to allowing usage if check fails
  }
}

/**
 * Record invitation usage
 */
export async function recordInvitationUsage(
  invitationId: string, 
  email: string, 
  userId?: string,
  currentUsageCount: number = 0
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerSupabaseClient();
    
    // Insert usage record
    const { error: usageError } = await supabase
      .from('invitation_usage')
      .insert({
        invitation_id: invitationId,
        email: email.toLowerCase(),
        user_id: userId || null
      });
    
    if (usageError) {
      // If it's a unique constraint violation, the email already used this invitation
      if (usageError.code === '23505') {
        return {
          success: false,
          error: 'This email has already been used with this invitation'
        };
      }
      throw usageError;
    }
    
    // Update invitation usage count
    const { error: updateError } = await supabase
      .from('invitations')
      .update({
        usage_count: currentUsageCount + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationId);
    
    if (updateError) {
      console.error('Error updating invitation usage count:', updateError);
      // Don't fail the operation, just log the error
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error recording invitation usage:', error);
    return {
      success: false,
      error: 'Failed to record invitation usage'
    };
  }
}

/**
 * Get invitation usage statistics
 */
export async function getInvitationStats(chapterId: string): Promise<{
  total_invitations: number;
  active_invitations: number;
  total_usage: number;
  pending_approvals: number;
}> {
  try {
    const supabase = createServerSupabaseClient();
    
    // Get basic invitation counts
    const { count: totalInvitations } = await supabase
      .from('invitations')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId);
    
    const { count: activeInvitations } = await supabase
      .from('invitations')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .eq('is_active', true);
    
    // Get total usage count
    const { data: invitationIds } = await supabase
      .from('invitations')
      .select('id')
      .eq('chapter_id', chapterId);

    const { count: totalUsage } = await supabase
      .from('invitation_usage')
      .select('*', { count: 'exact', head: true })
      .in('invitation_id', invitationIds?.map(inv => inv.id) || []);
    
    // Get pending approvals (users who used invitations but haven't been approved yet)
    const { count: pendingApprovals } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .eq('role', 'active_member')
      .eq('member_status', 'probation'); // Assuming probation status for pending approvals
    
    return {
      total_invitations: totalInvitations || 0,
      active_invitations: activeInvitations || 0,
      total_usage: totalUsage || 0,
      pending_approvals: pendingApprovals || 0
    };
  } catch (error) {
    console.error('Error getting invitation stats:', error);
    return {
      total_invitations: 0,
      active_invitations: 0,
      total_usage: 0,
      pending_approvals: 0
    };
  }
}

/**
 * Generate invitation URL
 */
export function generateInvitationUrl(token: string, invitationType?: string, baseUrl?: string): string {
  // If baseUrl is explicitly provided, use it (for server-side with specific requirements)
  // Otherwise, use getBaseUrl() which detects browser vs server environment
  const base = baseUrl || getBaseUrl();

  // Route to alumni join page for alumni invitations
  if (invitationType === 'alumni') {
    return `${base}/alumni-join/${token}`;
  }
  
  return `${base}/join/${token}`;
}

/**
 * Generate a canonical chapter join URL using the chapter's slug.
 * This link allows invitees to choose their role (alumni vs active) at join time.
 */
export function generateChapterJoinUrl(slug: string, baseUrl?: string): string {
  const base = baseUrl || getBaseUrl();
  return `${base}/join/chapter/${slug}`;
}
