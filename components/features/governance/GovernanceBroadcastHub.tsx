'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Building2, Mail, Megaphone, Send, Smartphone, X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { useGovernanceChapters } from '@/lib/hooks/useGovernanceChapters';
import { useAnnouncementImageAttachment } from '@/lib/hooks/useAnnouncementImageAttachment';
import { AnnouncementImageAttachmentField } from '@/components/features/dashboard/dashboards/ui/AnnouncementImageAttachmentField';
import {
  AnnouncementPrimaryLinkFields,
  isValidHttpsAnnouncementLinkInput,
} from '@/components/features/dashboard/dashboards/ui/AnnouncementPrimaryLinkFields';
import type { RecipientPreviewResponse } from '@/types/announcements';
import { toast } from 'react-toastify';

/**
 * Governance-only broadcast hub: matches Exec Admin Overview “Chapter Announcements” card styling
 * with multi-chapter targeting, preview totals, and POST /api/announcements with chapter_ids.
 */
export function GovernanceBroadcastHub() {
  const { profile } = useProfile();
  const { session } = useAuth();
  const { data: governanceData, isLoading: chaptersLoading } = useGovernanceChapters();

  const chapters = governanceData?.chapters ?? [];
  const chaptersInitRef = useRef(false);

  const [announcement, setAnnouncement] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementType, setAnnouncementType] = useState<'general' | 'urgent' | 'event' | 'academic'>('general');
  const [sendSmsToMembers, setSendSmsToMembers] = useState(false);
  const [sendSmsToAlumni, setSendSmsToAlumni] = useState(false);
  const [sendEmailToMembers, setSendEmailToMembers] = useState(false);
  const [sendEmailToAlumni, setSendEmailToAlumni] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<RecipientPreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [primaryLinkUrl, setPrimaryLinkUrl] = useState('');
  const [primaryLinkLabel, setPrimaryLinkLabel] = useState('');

  const {
    pendingImage,
    imageAlt,
    setImageAlt,
    imageUploading,
    handleFileChange,
    processImageFile,
    removeImage,
    resetAttachment,
    buildMetadata,
    acceptTypes,
  } = useAnnouncementImageAttachment();

  useEffect(() => {
    setSendSmsToMembers(announcementType === 'urgent');
    setSendSmsToAlumni(false);
  }, [announcementType]);

  useEffect(() => {
    if (chapters.length === 0 || chaptersInitRef.current) return;
    setSelectedChapterIds(chapters.map((c) => c.id));
    chaptersInitRef.current = true;
  }, [chapters]);

  const fetchMultiChapterPreview = useCallback(
    async (chapterIds: string[]) => {
      if (!session?.access_token || chapterIds.length === 0) {
        setPreviewData(null);
        return;
      }

      setLoadingPreview(true);
      try {
        const response = await fetch('/api/announcements/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ chapter_ids: chapterIds }),
        });

        if (response.ok) {
          const data: RecipientPreviewResponse = await response.json();
          setPreviewData(data);
        } else {
          setPreviewData(null);
        }
      } catch (e) {
        console.error('Governance broadcast preview error:', e);
        setPreviewData(null);
      } finally {
        setLoadingPreview(false);
      }
    },
    [session?.access_token]
  );

  useEffect(() => {
    if (profile?.role !== 'governance') return;
    fetchMultiChapterPreview(selectedChapterIds);
  }, [selectedChapterIds, profile?.role, fetchMultiChapterPreview]);

  if (profile?.role !== 'governance') {
    return null;
  }

  const allSelected =
    chapters.length > 0 && selectedChapterIds.length === chapters.length;

  const toggleChapter = (id: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]
    );
  };

  const toggleAllChapters = () => {
    if (allSelected) {
      setSelectedChapterIds([]);
    } else {
      setSelectedChapterIds(chapters.map((c) => c.id));
    }
  };

  const displayCounts = previewData
    ? {
        sms: previewData.totals.sms_recipients,
        alumniSms: previewData.totals.alumni_sms_recipients,
        email: previewData.totals.email_recipients,
        alumniEmail: previewData.totals.alumni_email_recipients,
      }
    : {
        sms: null as number | null,
        alumniSms: null as number | null,
        email: null as number | null,
        alumniEmail: null as number | null,
      };

  const handleSend = async () => {
    if (!announcementTitle.trim() || !announcement.trim()) {
      toast.error('Please fill in both title and content');
      return;
    }

    if (!sendSmsToMembers && !sendSmsToAlumni && !sendEmailToMembers && !sendEmailToAlumni) {
      toast.error('Please select at least one delivery method');
      return;
    }

    if (selectedChapterIds.length === 0) {
      toast.error('Please select at least one chapter');
      return;
    }

    if (!session?.access_token) {
      toast.error('Not signed in');
      return;
    }

    if (!isValidHttpsAnnouncementLinkInput(primaryLinkUrl)) {
      toast.error('Enter a valid https:// link or clear the link field.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: announcementTitle.trim(),
          content: announcement.trim(),
          announcement_type: announcementType,
          send_sms: sendSmsToMembers,
          send_sms_to_alumni: sendSmsToAlumni,
          send_email_to_members: sendEmailToMembers,
          send_email_to_alumni: sendEmailToAlumni,
          metadata: buildMetadata(
            primaryLinkUrl.trim()
              ? { primaryLink: { url: primaryLinkUrl, label: primaryLinkLabel } }
              : undefined
          ),
          chapter_ids: selectedChapterIds,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(typeof err.error === 'string' ? err.error : 'Failed to create announcements');
      }

      const { announcements } = await response.json();
      const succeeded = announcements.filter((a: { announcement: unknown }) => a.announcement !== null).length;
      const failed = announcements.length - succeeded;

      if (failed > 0) {
        toast.warning(`Sent to ${succeeded} chapter(s), ${failed} failed`);
      } else {
        toast.success(`Announcement sent to ${succeeded} chapter(s)!`);
      }

      setAnnouncement('');
      setAnnouncementTitle('');
      setAnnouncementType('general');
      setSendSmsToMembers(false);
      setSendSmsToAlumni(false);
      setSendEmailToMembers(false);
      setSendEmailToAlumni(false);
      setPrimaryLinkUrl('');
      setPrimaryLinkLabel('');
      resetAttachment();
      setSelectedChapterIds(chapters.map((c) => c.id));
      setMobileSheetOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send announcement');
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formSuffixDesktop = 'desktop';
  const formSuffixMobile = 'mobile';

  const renderBroadcastForm = (
    suffix: string,
    options: { layout: 'desktop' | 'sheet'; stickyFooter?: boolean }
  ) => {
    const { layout, stickyFooter = false } = options;
    const isSheet = layout === 'sheet';
    const id = (base: string) => `${base}-${suffix}`;

    const formBody = (
      <div
        className={cn(
          'grid gap-4',
          isSheet ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'
        )}
      >
          <div className={cn('space-y-3', !isSheet && 'lg:col-span-2')}>
            <div
              className={cn(
                'grid gap-3',
                isSheet ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'
              )}
            >
              <Input
                placeholder="Announcement title..."
                value={announcementTitle}
                onChange={(e) => setAnnouncementTitle(e.target.value)}
                className={isSheet ? 'w-full' : 'md:col-span-2'}
              />
              <Select
                value={announcementType}
                onValueChange={(value: string) =>
                  setAnnouncementType(value as 'general' | 'urgent' | 'event' | 'academic')
                }
              >
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="academic">Academic</SelectItem>
              </Select>
            </div>

            <Textarea
              placeholder="Write an announcement to selected chapters..."
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              className={cn('min-h-[100px]', isSheet && 'min-h-[120px] resize-none')}
            />

            <AnnouncementImageAttachmentField
              idSuffix={`governance-broadcast-${suffix}`}
              pendingImage={pendingImage}
              imageAlt={imageAlt}
              onAltChange={setImageAlt}
              imageUploading={imageUploading}
              acceptTypes={acceptTypes}
              onFileChange={handleFileChange}
              processImageFile={processImageFile}
              onRemove={removeImage}
              disabled={isSubmitting}
            />

            <AnnouncementPrimaryLinkFields
              idSuffix={`governance-broadcast-${suffix}`}
              url={primaryLinkUrl}
              label={primaryLinkLabel}
              onUrlChange={setPrimaryLinkUrl}
              onLabelChange={setPrimaryLinkLabel}
              disabled={isSubmitting}
              compact={isSheet}
            />
          </div>

          <div
            className={cn(
              'rounded-lg border border-primary-100/50 bg-white/60 p-3 space-y-2',
              !isSheet && 'lg:col-span-1'
            )}
          >
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              Send to
            </p>
            <label className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={toggleAllChapters} />
              <span className="text-sm text-gray-800">
                All chapters ({chapters.length})
              </span>
            </label>
            <div className="max-h-44 overflow-y-auto rounded-md border border-gray-100 divide-y divide-gray-100">
              {chapters.map((ch) => (
                <label
                  key={ch.id}
                  className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedChapterIds.includes(ch.id)}
                    onCheckedChange={() => toggleChapter(ch.id)}
                  />
                  <span className="text-sm text-gray-700 truncate">{ch.name}</span>
                </label>
              ))}
            </div>
            {selectedChapterIds.length > 0 && (
              <p className="text-xs text-gray-500">
                {selectedChapterIds.length} chapter
                {selectedChapterIds.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        </div>
    );

    const formDelivery = (
        <div
          className={cn(
            'pt-1',
            isSheet
              ? 'flex flex-col gap-3'
              : 'flex flex-col md:flex-row items-start md:items-center justify-between gap-3'
          )}
        >
          <div className="flex flex-col space-y-3 flex-1 w-full">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Delivery options
            </p>

            <div
              className={cn(
                'grid grid-cols-2',
                isSheet ? 'gap-x-2 gap-y-2' : 'gap-3'
              )}
            >
              <div
                className={cn(
                  'flex items-center',
                  isSheet ? 'gap-1.5' : 'space-x-2'
                )}
              >
                <Checkbox
                  id={id('gov-send-sms-members')}
                  checked={sendSmsToMembers}
                  onCheckedChange={(checked) => setSendSmsToMembers(checked as boolean)}
                />
                <Label
                  htmlFor={id('gov-send-sms-members')}
                  className={cn(
                    'cursor-pointer flex items-center font-medium',
                    isSheet
                      ? 'gap-1 text-[11px] leading-tight whitespace-nowrap'
                      : 'gap-1.5 text-sm'
                  )}
                >
                  <Smartphone
                    className={cn(
                      'shrink-0 text-gray-500',
                      isSheet ? 'h-3 w-3' : 'h-3.5 w-3.5'
                    )}
                  />
                  SMS to Actives
                  {displayCounts.sms !== null && (
                    <span
                      className={cn(
                        'shrink-0 font-normal text-gray-500 tabular-nums',
                        isSheet ? 'text-[10px]' : 'text-xs'
                      )}
                    >
                      ({displayCounts.sms})
                    </span>
                  )}
                </Label>
              </div>

              <div
                className={cn(
                  'flex items-center',
                  isSheet ? 'gap-1.5' : 'space-x-2'
                )}
              >
                <Checkbox
                  id={id('gov-send-sms-alumni')}
                  checked={sendSmsToAlumni}
                  onCheckedChange={(checked) => setSendSmsToAlumni(checked as boolean)}
                />
                <Label
                  htmlFor={id('gov-send-sms-alumni')}
                  className={cn(
                    'cursor-pointer flex items-center font-medium',
                    isSheet
                      ? 'gap-1 text-[11px] leading-tight whitespace-nowrap'
                      : 'gap-1.5 text-sm'
                  )}
                >
                  <Smartphone
                    className={cn(
                      'shrink-0 text-gray-500',
                      isSheet ? 'h-3 w-3' : 'h-3.5 w-3.5'
                    )}
                  />
                  SMS to Alumni
                  {displayCounts.alumniSms !== null && (
                    <span
                      className={cn(
                        'shrink-0 font-normal text-gray-500 tabular-nums',
                        isSheet ? 'text-[10px]' : 'text-xs'
                      )}
                    >
                      ({displayCounts.alumniSms})
                    </span>
                  )}
                </Label>
              </div>

              <div
                className={cn(
                  'flex items-center',
                  isSheet ? 'gap-1.5' : 'space-x-2'
                )}
              >
                <Checkbox
                  id={id('gov-send-email-members')}
                  checked={sendEmailToMembers}
                  onCheckedChange={(checked) => setSendEmailToMembers(checked as boolean)}
                />
                <Label
                  htmlFor={id('gov-send-email-members')}
                  className={cn(
                    'cursor-pointer flex items-center font-medium',
                    isSheet
                      ? 'gap-1 text-[11px] leading-tight whitespace-nowrap'
                      : 'gap-1.5 text-sm'
                  )}
                >
                  <Mail
                    className={cn(
                      'shrink-0 text-gray-500',
                      isSheet ? 'h-3 w-3' : 'h-3.5 w-3.5'
                    )}
                  />
                  Email to Actives
                  {displayCounts.email !== null && (
                    <span
                      className={cn(
                        'shrink-0 font-normal text-gray-500 tabular-nums',
                        isSheet ? 'text-[10px]' : 'text-xs'
                      )}
                    >
                      ({displayCounts.email})
                    </span>
                  )}
                </Label>
              </div>

              <div
                className={cn(
                  'flex items-center',
                  isSheet ? 'gap-1.5' : 'space-x-2'
                )}
              >
                <Checkbox
                  id={id('gov-send-email-alumni')}
                  checked={sendEmailToAlumni}
                  onCheckedChange={(checked) => setSendEmailToAlumni(checked as boolean)}
                />
                <Label
                  htmlFor={id('gov-send-email-alumni')}
                  className={cn(
                    'cursor-pointer flex items-center font-medium',
                    isSheet
                      ? 'gap-1 text-[11px] leading-tight whitespace-nowrap'
                      : 'gap-1.5 text-sm'
                  )}
                >
                  <Mail
                    className={cn(
                      'shrink-0 text-gray-500',
                      isSheet ? 'h-3 w-3' : 'h-3.5 w-3.5'
                    )}
                  />
                  Email to Alumni
                  {displayCounts.alumniEmail !== null && (
                    <span
                      className={cn(
                        'shrink-0 font-normal text-gray-500 tabular-nums',
                        isSheet ? 'text-[10px]' : 'text-xs'
                      )}
                    >
                      ({displayCounts.alumniEmail})
                    </span>
                  )}
                </Label>
              </div>
            </div>

            {loadingPreview && (
              <p className="text-xs text-gray-400 pl-0.5">Loading recipient counts…</p>
            )}

            {previewData && previewData.chapters.length > 1 && (
              <details className="mt-1">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                  Per-chapter breakdown
                </summary>
                <div className="mt-1 space-y-1 pl-0.5">
                  {previewData.chapters.map((ch) => (
                    <div
                      key={ch.chapter_id}
                      className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0"
                    >
                      <span className="font-medium truncate max-w-[140px]">
                        {ch.chapter_name}
                      </span>
                      <span className="text-gray-400">
                        SMS {ch.sms_recipients + ch.alumni_sms_recipients} · Email{' '}
                        {ch.email_recipients + ch.alumni_email_recipients}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {!isSheet && (
            <Button
              className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 w-full md:w-auto transition-all duration-300"
              onClick={handleSend}
              disabled={isSubmitting || selectedChapterIds.length === 0}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting
                ? 'Sending…'
                : selectedChapterIds.length > 1
                  ? `Send to ${selectedChapterIds.length} chapters`
                  : 'Send announcement'}
            </Button>
          )}
        </div>
    );

    if (stickyFooter && !isSheet) {
      return (
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">{formBody}</div>
          <div className="mt-3 flex-shrink-0 border-t border-primary-100/30 bg-white/80 pt-3">
            {formDelivery}
          </div>
        </>
      );
    }

    return (
      <>
        {formBody}
        {formDelivery}
      </>
    );
  };

  const emptyOrLoading = chaptersLoading ? (
    <p className="text-sm text-gray-500 py-6">Loading chapters…</p>
  ) : chapters.length === 0 ? (
    <p className="text-sm text-gray-500 py-6">
      No managed chapters assigned. Contact a developer to add governance chapter access.
    </p>
  ) : null;

  return (
    <div className="mb-6">
      {/* Desktop: inline card (unchanged layout for md+) */}
      <div className="hidden md:block">
        <Card className="flex min-h-0 w-full max-h-[min(640px,85vh)] flex-col bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
          <CardHeader className="pb-3 flex-shrink-0 border-b border-primary-100/30">
            <CardTitle className="flex items-center space-x-2">
              <Megaphone className="h-5 w-5 text-brand-primary" />
              <span className="text-primary-900">Chapter announcements</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-6 pt-4">
            {emptyOrLoading ?? (
              <>
                {renderBroadcastForm(formSuffixDesktop, {
                  layout: 'desktop',
                  stickyFooter: true,
                })}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mobile: FAB + bottom sheet (same flow as SendAnnouncementButton) */}
      <div className="md:hidden">
        {!chaptersLoading && chapters.length === 0 && (
          <p className="text-sm text-gray-500 py-2">
            No managed chapters for announcements. Use desktop or contact a developer for
            access.
          </p>
        )}
        {!chaptersLoading && chapters.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setMobileSheetOpen(true)}
              className="fixed bottom-24 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-brand-primary px-4 py-3 shadow-lg transition-colors duration-200 hover:bg-brand-primary-hover"
              style={{
                boxShadow: `
                  0 8px 16px rgba(0, 0, 0, 0.2),
                  0 4px 8px rgba(0, 0, 0, 0.12)
                `,
              }}
              aria-label="Create chapter announcement"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Megaphone className="h-4 w-4 text-white" />
              </div>
            </button>

            <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
              <SheetContent
                side="bottom"
                backdropClassName="sm:hidden"
                className="sm:hidden flex max-h-[90dvh] flex-col rounded-t-2xl border-0 p-0"
              >
                <div className="flex-shrink-0 rounded-t-2xl bg-brand-primary px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                        <Megaphone className="h-4 w-4 text-white" />
                      </div>
                      <h3 className="text-base font-semibold text-white">
                        Chapter announcements
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileSheetOpen(false)}
                      className="rounded-lg p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {emptyOrLoading ?? (
                    <div className="space-y-4">
                      {renderBroadcastForm(formSuffixMobile, { layout: 'sheet' })}
                    </div>
                  )}
                </div>

                {!emptyOrLoading && (
                  <div className="flex flex-shrink-0 flex-row gap-3 border-t border-gray-200 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
                      onClick={() => setMobileSheetOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 rounded-full bg-brand-primary hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={handleSend}
                      disabled={isSubmitting || selectedChapterIds.length === 0}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {isSubmitting
                        ? 'Sending…'
                        : selectedChapterIds.length > 1
                          ? `Send (${selectedChapterIds.length})`
                          : 'Send'}
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </div>
  );
}
