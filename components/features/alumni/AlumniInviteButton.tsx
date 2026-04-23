'use client';

import { useState, useCallback, useRef, type KeyboardEvent, type ClipboardEvent } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { UserPlus, Copy, Mail, Share2, Loader2, Check, X, Send } from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';

interface AlumniInviteButtonProps {
  variant?: 'desktop' | 'mobile';
}

interface InvitationResult {
  invitation_url: string;
  chapter_name: string;
  invitation_token: string;
}

const EMAIL_SPLIT = /[,;\s\n]+/;

function isValidEmail(value: string): boolean {
  return z.string().email().safeParse(value.trim()).success;
}

/** Split pasted text into tokens (handles comma lists and line breaks). */
function tokenizePastedEmails(raw: string): string[] {
  return raw
    .split(EMAIL_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeRecipients(chips: string[], draft: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of chips) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  const t = draft.trim();
  if (t && isValidEmail(t)) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t.trim());
    }
  }
  return out;
}

export function AlumniInviteButton({ variant = 'desktop' }: AlumniInviteButtonProps) {
  const { getAuthHeadersAsync } = useAuth();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(false);
  const [invitation, setInvitation] = useState<InvitationResult | null>(null);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailChips, setEmailChips] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [personalNoteInput, setPersonalNoteInput] = useState('');
  const [sendEmailLoading, setSendEmailLoading] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

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
      const token = data.invitation?.token as string | undefined;
      if (!token) {
        throw new Error('Invalid invitation response');
      }
      setInvitation({
        invitation_url: data.invitation.invitation_url,
        chapter_name: data.invitation.chapter_name,
        invitation_token: token,
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

  /** Reopen share UI if we already have an invite; otherwise create one. */
  const handleInvitePrimaryClick = useCallback(() => {
    if (invitation) {
      setShowSharePanel(true);
      return;
    }
    void generateInvite();
  }, [invitation, generateInvite]);

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

  const openEmailDialog = useCallback(() => {
    setEmailChips([]);
    setEmailDraft('');
    setPersonalNoteInput('');
    setEmailDialogOpen(true);
  }, []);

  const tryCommitDraft = useCallback(
    (raw?: string): boolean => {
      const value = (raw ?? emailDraft).trim();
      if (!value) return false;
      if (!isValidEmail(value)) {
        toast.error('Enter a valid email address');
        return false;
      }
      const key = value.toLowerCase();
      if (emailChips.some((c) => c.toLowerCase() === key)) {
        toast.info('That address is already added');
        setEmailDraft('');
        return true;
      }
      if (emailChips.length >= 20) {
        toast.error('You can add at most 20 addresses');
        return false;
      }
      setEmailChips((prev) => [...prev, value.trim()]);
      setEmailDraft('');
      return true;
    },
    [emailDraft, emailChips]
  );

  const removeChip = useCallback((index: number) => {
    setEmailChips((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleEmailChipKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
        e.preventDefault();
        tryCommitDraft();
        return;
      }
      if (e.key === 'Backspace' && emailDraft === '' && emailChips.length > 0) {
        e.preventDefault();
        setEmailChips((prev) => prev.slice(0, -1));
      }
    },
    [emailDraft, emailChips.length, tryCommitDraft]
  );

  const handleEmailPaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || !text.includes('@')) return;
    const tokens = tokenizePastedEmails(text);
    if (tokens.length <= 1) return;
    e.preventDefault();
    setEmailChips((prev) => {
      const next = [...prev];
      const seen = new Set(next.map((x) => x.toLowerCase()));
      for (const t of tokens) {
        if (!isValidEmail(t)) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        if (next.length >= 20) break;
        seen.add(key);
        next.push(t.trim());
      }
      return next;
    });
    setEmailDraft('');
  }, []);

  const handleSendInviteEmails = useCallback(async () => {
    if (!invitation) return;
    const draftTrim = emailDraft.trim();
    if (draftTrim && !isValidEmail(draftTrim)) {
      toast.error('Fix or remove the incomplete email in the input');
      return;
    }
    const recipients = mergeRecipients(emailChips, emailDraft);
    if (recipients.length === 0) {
      toast.error('Enter at least one email address');
      return;
    }
    if (recipients.length > 20) {
      toast.error('You can send to at most 20 addresses at once');
      return;
    }

    setSendEmailLoading(true);
    try {
      const headers = await getAuthHeadersAsync();
      const body: {
        token: string;
        recipients: string[];
        personal_note?: string;
      } = {
        token: invitation.invitation_token,
        recipients,
      };
      const note = personalNoteInput.trim();
      if (note) body.personal_note = note;

      const response = await fetch('/api/invitations/alumni/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not send emails');
      }

      const sent = typeof data.sent === 'number' ? data.sent : 0;
      const failed = Array.isArray(data.failed) ? data.failed : [];

      if (sent > 0) {
        toast.success(
          sent === 1 ? 'Invitation email sent.' : `${sent} invitation emails sent.`
        );
      }
      if (failed.length > 0) {
        toast.warn(
          `${failed.length} address(es) could not be sent. Check the email and try again.`
        );
      }
      if (sent === 0 && failed.length === 0) {
        toast.error('No emails were sent. Please try again.');
      }

      if (failed.length === 0 && sent > 0) {
        setEmailDialogOpen(false);
        setEmailChips([]);
        setEmailDraft('');
        setPersonalNoteInput('');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(message);
    } finally {
      setSendEmailLoading(false);
    }
  }, [
    invitation,
    emailChips,
    emailDraft,
    personalNoteInput,
    getAuthHeadersAsync,
  ]);

  const handleMailtoFallback = useCallback(() => {
    if (!invitation) return;
    const appName = ['Trail', 'blaize'].join(''); // pragma: allowlist secret
    const subject = encodeURIComponent(`Join ${invitation.chapter_name} alumni on ${appName}`);
    const body = encodeURIComponent(
      `Hey!\n\nI'd love for you to join our alumni community on ${appName}. ` +
        `Use this link to get started:\n\n${invitation.invitation_url}\n\n` +
        `See you there!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
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

  const shareLinkActions = invitation ? (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={invitation.invitation_url}
          className="flex-1 min-w-0 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2"
        />
        <Button
          variant="outline"
          size="sm"
          type="button"
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

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={openEmailDialog}
          className="flex-1 rounded-full text-sm text-gray-700 border-gray-200 hover:bg-gray-50"
        >
          <Mail className="h-4 w-4 mr-1.5" />
          Email
        </Button>
        {canNativeShare && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleNativeShare}
            className="flex-1 rounded-full text-sm text-gray-700 border-gray-200 hover:bg-gray-50"
          >
            <Share2 className="h-4 w-4 mr-1.5" />
            Share
          </Button>
        )}
      </div>

      <button
        type="button"
        onClick={handleMailtoFallback}
        className="w-full text-center text-xs text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
      >
        Use my email app instead
      </button>
    </div>
  ) : null;

  return (
    <>
      <div className="w-full">
        <Button
          onClick={handleInvitePrimaryClick}
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

      {/* Desktop: inline share card below the button (unchanged UX) */}
      {variant === 'desktop' && showSharePanel && invitation && (
        <div className="mt-3 w-full rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
              <UserPlus className="h-4 w-4 text-brand-primary flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900 truncate">
                Invite alumni to {invitation.chapter_name}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-full hover:bg-gray-200 transition-colors flex-shrink-0"
              aria-label="Close share panel"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div className="px-4 py-3">{shareLinkActions}</div>
        </div>
      )}

      {/* Mobile: share + link UI in a modal so it is usable beside Edit Profile */}
      {variant === 'mobile' && invitation && (
        <Dialog
          open={showSharePanel}
          onOpenChange={(open) => {
            if (!open) handleClose();
          }}
        >
          <DialogContent
            className={cn(
              'flex max-h-[min(90vh,640px)] w-[calc(100vw-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-md',
              'rounded-2xl sm:rounded-lg'
            )}
          >
            <DialogHeader className="shrink-0 space-y-1 border-b border-gray-100 px-4 pb-3 pt-4 text-left">
              <DialogTitle className="flex items-start gap-2 pr-6 text-base leading-snug">
                <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
                <span>Invite alumni to {invitation.chapter_name}</span>
              </DialogTitle>
              <DialogDescription className="sr-only">
                Copy your link or send invitations by email or share sheet.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{shareLinkActions}</div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={emailDialogOpen}
        onOpenChange={(open) => {
          setEmailDialogOpen(open);
          if (!open) {
            setEmailChips([]);
            setEmailDraft('');
          }
        }}
      >
        <DialogContent
          className={cn(
            'w-[calc(100vw-2.5rem)] max-w-[calc(100vw-2.5rem)] gap-3 rounded-2xl p-4 sm:w-full sm:max-w-md sm:gap-4 sm:rounded-lg sm:p-6'
          )}
        >
          <DialogHeader className="space-y-2 sm:space-y-1.5">
            <DialogTitle className="text-base sm:text-lg">Send invitation by email</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              We&apos;ll email your join link from Trailblaize. Type an address and press{' '}
              <strong>Enter</strong> or <strong>Space</strong> to add it. You can also paste several at
              once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1 sm:space-y-4 sm:py-2">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="alumni-invite-email-input">Email addresses</Label>
              <div
                role="group"
                aria-label="Recipient email addresses"
                className={cn(
                  'flex min-h-[48px] w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background',
                  'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                  sendEmailLoading && 'pointer-events-none opacity-60'
                )}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) emailInputRef.current?.focus();
                }}
              >
                {emailChips.map((email, index) => (
                  <Badge
                    key={`${email}-${index}`}
                    variant="secondary"
                    className="max-w-full shrink-0 gap-1 pl-2.5 pr-1 font-normal"
                  >
                    <span
                      className="max-w-[min(220px,calc(100vw-5.5rem))] truncate sm:max-w-[220px]"
                      title={email}
                    >
                      {email}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeChip(index)}
                      className="rounded-full p-0.5 hover:bg-muted-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label={`Remove ${email}`}
                      disabled={sendEmailLoading}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  ref={emailInputRef}
                  id="alumni-invite-email-input"
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  autoComplete="email"
                  placeholder={emailChips.length === 0 ? 'name@example.com' : 'Add another…'}
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={handleEmailChipKeyDown}
                  onPaste={handleEmailPaste}
                  disabled={sendEmailLoading}
                  className="min-w-[100px] flex-1 border-0 bg-transparent py-1 text-[16px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed sm:min-w-[140px] sm:text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="alumni-invite-note">Personal note (optional)</Label>
              <Textarea
                id="alumni-invite-note"
                placeholder="Add a short message…"
                value={personalNoteInput}
                onChange={(e) => setPersonalNoteInput(e.target.value)}
                rows={3}
                maxLength={2000}
                disabled={sendEmailLoading}
                className="min-h-[64px] resize-y text-[16px] sm:min-h-[72px] sm:text-sm"
              />
            </div>
          </div>
          <DialogFooter className="mt-1 gap-2 sm:mt-0 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setEmailDialogOpen(false)}
              disabled={sendEmailLoading}
            >
              Cancel
            </Button>
            <Button type="button" className="rounded-full" onClick={handleSendInviteEmails} disabled={sendEmailLoading}>
              {sendEmailLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
