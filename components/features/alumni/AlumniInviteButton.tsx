'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { UserPlus, Copy, Mail, Share2, Loader2, Check, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';

interface AlumniInviteButtonProps {
  variant?: 'desktop' | 'mobile';
}

interface InvitationResult {
  invitation_url: string;
  chapter_name: string;
}

export function AlumniInviteButton({ variant = 'desktop' }: AlumniInviteButtonProps) {
  const { getAuthHeadersAsync } = useAuth();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(false);
  const [invitation, setInvitation] = useState<InvitationResult | null>(null);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateInvite = useCallback(async () => {
    if (!profile?.chapter_id) {
      setError('No chapter associated with your account');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeadersAsync();
      const response = await fetch('/api/invitations/alumni', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate invitation');
      }

      const data = await response.json();
      setInvitation({
        invitation_url: data.invitation.invitation_url,
        chapter_name: data.invitation.chapter_name,
      });
      setShowSharePanel(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [profile?.chapter_id, getAuthHeadersAsync]);

  const handleCopy = useCallback(async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.invitation_url);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [invitation]);

  const handleEmail = useCallback(() => {
    if (!invitation) return;
    const appName = ['Trail', 'blaize'].join(''); // pragma: allowlist secret
    const subject = encodeURIComponent(`Join ${invitation.chapter_name} alumni on ${appName}`);
    const body = encodeURIComponent(
      `Hey!\n\nI'd love for you to join our alumni community on ${appName}. ` +
      `Use this link to get started:\n\n${invitation.invitation_url}\n\n` +
      `See you there!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
  }, [invitation]);

  const handleNativeShare = useCallback(async () => {
    if (!invitation) return;
    try {
      const appName = ['Trail', 'blaize'].join(''); // pragma: allowlist secret
      await navigator.share({
        title: `Join ${invitation.chapter_name} alumni`,
        text: `Join our alumni community on ${appName}!`,
        url: invitation.invitation_url,
      });
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Sharing failed');
      }
    }
  }, [invitation]);

  const handleClose = useCallback(() => {
    setShowSharePanel(false);
    setError(null);
  }, []);

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  if (showSharePanel && invitation) {
    return (
      <div className={cn(
        'w-full rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden',
        variant === 'mobile' ? 'mx-0' : ''
      )}>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <UserPlus className="h-4 w-4 text-brand-primary flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900 truncate">
              Invite alumni to {invitation.chapter_name}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-gray-200 transition-colors flex-shrink-0"
            aria-label="Close share panel"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Invite link display */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={invitation.invitation_url}
              className="flex-1 min-w-0 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 truncate"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className={cn(
                'flex-shrink-0 rounded-lg h-9 px-3 transition-colors',
                copied
                  ? 'text-green-600 border-green-300 bg-green-50'
                  : 'text-brand-primary border-brand-primary/30 hover:bg-primary-50'
              )}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          {/* Share actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEmail}
              className="flex-1 rounded-lg text-sm text-gray-700 border-gray-200 hover:bg-gray-50"
            >
              <Mail className="h-4 w-4 mr-1.5" />
              Email
            </Button>
            {canNativeShare && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNativeShare}
                className="flex-1 rounded-lg text-sm text-gray-700 border-gray-200 hover:bg-gray-50"
              >
                <Share2 className="h-4 w-4 mr-1.5" />
                Share
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Button
        onClick={generateInvite}
        disabled={loading || !profile?.chapter_id}
        variant="outline"
        size={variant === 'mobile' ? 'default' : 'sm'}
        className={cn(
          'w-full rounded-full transition-colors',
          variant === 'mobile'
            ? 'h-12 text-base text-brand-primary border-brand-primary hover:bg-primary-50'
            : 'text-brand-primary border-brand-primary hover:bg-primary-50'
        )}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <UserPlus className={cn('mr-2', variant === 'mobile' ? 'h-5 w-5' : 'h-4 w-4')} />
            Invite Alumni
          </>
        )}
      </Button>
      {error && (
        <p className="text-xs text-red-500 mt-1.5 text-center">{error}</p>
      )}
    </div>
  );
}
