'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Copy, Calendar, Users, CheckCircle, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  type ApprovalMode,
  InvitationWithUsage,
  CreateInvitationData,
  UpdateInvitationData
} from '@/types/invitations';
import { generateInvitationUrl } from '@/lib/utils/invitationUtils';
import { toast } from 'react-toastify';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface CreateInviteModalProps {
  invitation?: InvitationWithUsage;
  onClose: () => void;
  onSubmit: (data: CreateInvitationData | UpdateInvitationData) => void;
}

/** Above DashboardHeader (z-[100]); below app toast (zIndex 10004). */
const MODAL_OVERLAY_Z = 10000;
const MODAL_LAYER_Z = 10001;

export function CreateInviteModal({ invitation, onClose, onSubmit }: CreateInviteModalProps) {
  const [formData, setFormData] = useState({
    email_domain_allowlist: [], // Always empty - no restrictions
    approval_mode: invitation?.approval_mode || 'auto',
    expires_at: invitation?.expires_at ? new Date(invitation.expires_at).toISOString().slice(0, 16) : '',
    max_uses: invitation?.max_uses?.toString() || '',
    is_active: invitation?.is_active ?? true,
    invitation_type: invitation?.invitation_type || 'active_member'
  });
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /** Keep form in sync when switching which invitation is being edited (same modal instance). */
  useEffect(() => {
    setFormData({
      email_domain_allowlist: [],
      approval_mode: invitation?.approval_mode || 'auto',
      expires_at: invitation?.expires_at ? new Date(invitation.expires_at).toISOString().slice(0, 16) : '',
      max_uses: invitation?.max_uses?.toString() || '',
      is_active: invitation?.is_active ?? true,
      invitation_type: invitation?.invitation_type || 'active_member'
    });
  }, [invitation?.id]);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = {
        email_domain_allowlist: [], // Always empty - no email restrictions
        approval_mode: formData.approval_mode,
        expires_at: formData.expires_at || null,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
        is_active: formData.is_active,
        invitation_type: formData.invitation_type
      };

      await onSubmit(submitData);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyInvitationLink = () => {
    if (invitation) {
      const url = generateInvitationUrl(invitation.token, invitation.invitation_type);
      navigator.clipboard.writeText(url);
      toast.success('Invitation link copied to clipboard!');
    }
  };

  // Content component (shared between mobile and desktop)
  const content = (
    <div className="flex flex-col min-h-0">
      {/* Header - Fixed */}
      <div className="flex items-center justify-between p-4 md:p-6 border-b flex-shrink-0 bg-white">
        <h2 className="text-lg md:text-xl font-semibold">
          {invitation ? 'Edit Invitation' : 'Create New Invitation'}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable fields — max height only caps overflow; short forms stay compact */}
      <form
        id="invite-form"
        onSubmit={handleSubmit}
        className="overflow-y-auto overscroll-contain min-h-0 max-h-[calc(92dvh-10rem)] md:max-h-[min(78dvh,85svh)] px-4 py-4 md:p-6 space-y-4 md:space-y-6"
      >
        {/* Invitation Type */}
        <div className="space-y-2">
          <Label className="flex items-center space-x-2">
            <span>Invitation Type</span>
          </Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="active_member"
                name="invitation_type"
                value="active_member"
                checked={formData.invitation_type === 'active_member'}
                onChange={(e) => setFormData(prev => ({ ...prev, invitation_type: e.target.value as 'active_member' | 'alumni' }))}
                className="text-brand-accent"
              />
              <Label htmlFor="active_member" className="text-sm">
                Active Member
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="alumni"
                name="invitation_type"
                value="alumni"
                checked={formData.invitation_type === 'alumni'}
                onChange={(e) => setFormData(prev => ({ ...prev, invitation_type: e.target.value as 'active_member' | 'alumni' }))}
                className="text-purple-600"
              />
              <Label htmlFor="alumni" className="text-sm">
                Alumni
              </Label>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            {formData.invitation_type === 'active_member' 
              ? 'Active member invitations are for current students and recent graduates who want to join as active chapter members.'
              : 'Alumni invitations are for graduates who want to join as alumni members with professional networking features.'
            }
          </p>
        </div>

        {/* Membership approval — maps to invitations.approval_mode (API already persists it). */}
        <div className="space-y-2">
          <Label className="flex items-center space-x-2">
            <Shield className="h-4 w-4 text-gray-600" />
            <span>Membership approval</span>
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start space-x-2 rounded-lg border border-gray-200 p-3 has-[:checked]:border-brand-accent/60 has-[:checked]:bg-accent-50/40">
              <input
                type="radio"
                id="approval_auto"
                name="approval_mode"
                value="auto"
                checked={formData.approval_mode === 'auto'}
                onChange={() =>
                  setFormData((prev) => ({ ...prev, approval_mode: 'auto' as ApprovalMode }))
                }
                className="text-brand-accent mt-1"
              />
              <div>
                <Label htmlFor="approval_auto" className="text-sm font-medium cursor-pointer">
                  Auto-approve
                </Label>
                <p className="text-xs text-gray-600 mt-1">
                  Member gets chapter access after they complete signup through this link (when your chapter settings allow it).
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-2 rounded-lg border border-gray-200 p-3 has-[:checked]:border-brand-accent/60 has-[:checked]:bg-accent-50/40">
              <input
                type="radio"
                id="approval_pending"
                name="approval_mode"
                value="pending"
                checked={formData.approval_mode === 'pending'}
                onChange={() =>
                  setFormData((prev) => ({ ...prev, approval_mode: 'pending' as ApprovalMode }))
                }
                className="text-brand-accent mt-1"
              />
              <div>
                <Label htmlFor="approval_pending" className="text-sm font-medium cursor-pointer">
                  Requires chapter approval
                </Label>
                <p className="text-xs text-gray-600 mt-1">
                  Signup creates a membership request. Chapter execs must approve before the member gets chapter access.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Limits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="max_uses" className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Maximum Uses</span>
            </Label>
            <Input
              id="max_uses"
              type="number"
              min="1"
              placeholder="Leave empty for unlimited"
              value={formData.max_uses}
              onChange={(e) => setFormData(prev => ({ ...prev, max_uses: e.target.value }))}
            />
            <p className="text-sm text-gray-500">
              Maximum number of people who can use this invitation. Leave empty for unlimited.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires_at" className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>Expiration Date</span>
            </Label>
            <Input
              id="expires_at"
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => setFormData(prev => ({ ...prev, expires_at: e.target.value }))}
            />
            <p className="text-sm text-gray-500">
              When this invitation expires. Leave empty for no expiration.
            </p>
          </div>
        </div>

        {/* Email Uniqueness Info */}
        <div className="space-y-2">
          <Label className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-brand-accent" />
            <span>Email Uniqueness</span>
          </Label>
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <CheckCircle className="h-5 w-5 text-brand-accent mt-0.5" />
              <div>
                <h4 className="font-medium text-accent-900">One Account Per Email</h4>
                <p className="text-sm text-accent-800 mt-1">
                  Each email address can only create one account across the entire system. If someone tries to use an email that already has an account, they'll be prompted to sign in instead.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Active Status (only for editing) */}
        {invitation && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: !!checked }))}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
        )}

        {/* Show invitation link if editing */}
        {invitation && (
          <div className="space-y-2">
            <Label>Invitation Link</Label>
            <div className="flex space-x-2">
              <Input
                value={generateInvitationUrl(invitation.token)}
                readOnly
                className="bg-gray-50"
              />
              <Button
                type="button"
                onClick={copyInvitationLink}
                variant="outline"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

      </form>

      {/* Desktop actions outside scroll region so the panel can hug content height */}
      {!isMobile && (
        <div className="flex flex-col sm:flex-row sm:justify-end gap-3 sm:gap-0 sm:space-x-3 flex-shrink-0 border-t px-4 py-4 md:px-6 md:pb-6 bg-white">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="rounded-full bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="invite-form"
            className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </div>
            ) : (
              invitation ? 'Update Invitation' : 'Create Invitation'
            )}
          </Button>
        </div>
      )}

      {/* Mobile Footer - Fixed */}
      {isMobile && (
        <div className="flex-shrink-0 border-t bg-white p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="flex flex-row space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="invite-form"
              disabled={loading}
              className="flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : (
                invitation ? 'Update Invitation' : 'Create Invitation'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: MODAL_OVERLAY_Z }}>
      <div
        role="presentation"
        aria-hidden
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity pointer-events-auto"
        style={{ zIndex: MODAL_OVERLAY_Z }}
        onClick={onClose}
      />

      {isMobile ? (
        <div
          className="fixed inset-0 flex items-end justify-center pointer-events-none p-0"
          style={{ zIndex: MODAL_LAYER_Z }}
        >
          <div
            className={cn(
              'pointer-events-auto w-full flex flex-col min-h-0 overflow-hidden rounded-t-2xl bg-white shadow-xl',
              'max-h-[min(92dvh,100svh)] h-auto'
            )}
          >
            {content}
          </div>
        </div>
      ) : (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
          style={{ zIndex: MODAL_LAYER_Z }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
              'pointer-events-auto bg-white rounded-lg max-w-2xl w-full flex flex-col min-h-0 overflow-hidden',
              'max-h-[min(90dvh,100svh)] h-auto'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </motion.div>
        </div>
      )}
    </div>,
    document.body
  );
}
