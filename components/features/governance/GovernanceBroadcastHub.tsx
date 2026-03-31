'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Building2, Mail, Megaphone, Send, Smartphone } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { useGovernanceChapters } from '@/lib/hooks/useGovernanceChapters';
import { useAnnouncementImageAttachment } from '@/lib/hooks/useAnnouncementImageAttachment';
import { AnnouncementImageAttachmentField } from '@/components/features/dashboard/dashboards/ui/AnnouncementImageAttachmentField';
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
          metadata: buildMetadata(),
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
      resetAttachment();
      setSelectedChapterIds(chapters.map((c) => c.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send announcement');
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
          <Megaphone className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold text-gray-900">Broadcast announcements</h2>
      </div>

      <Card className="w-full flex flex-col max-h-[min(640px,85vh)] bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
        <CardHeader className="pb-3 flex-shrink-0 border-b border-primary-100/30">
          <CardTitle className="flex items-center space-x-2">
            <Megaphone className="h-5 w-5 text-brand-primary" />
            <span className="text-primary-900">Chapter announcements</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 flex-1 overflow-y-auto min-h-0">
          {chaptersLoading ? (
            <p className="text-sm text-gray-500 py-6">Loading chapters…</p>
          ) : chapters.length === 0 ? (
            <p className="text-sm text-gray-500 py-6">
              No managed chapters assigned. Contact a developer to add governance chapter access.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      placeholder="Announcement title..."
                      value={announcementTitle}
                      onChange={(e) => setAnnouncementTitle(e.target.value)}
                      className="md:col-span-2"
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
                    className="min-h-[100px]"
                  />

                  <AnnouncementImageAttachmentField
                    idSuffix="governance-broadcast"
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
                </div>

                <div className="lg:col-span-1 rounded-lg border border-primary-100/50 bg-white/60 p-3 space-y-2">
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

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-1">
                <div className="flex flex-col space-y-3 flex-1 w-full">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Delivery options
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="gov-send-sms-members"
                        checked={sendSmsToMembers}
                        onCheckedChange={(checked) => setSendSmsToMembers(checked as boolean)}
                      />
                      <Label htmlFor="gov-send-sms-members" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5 text-gray-500" />
                        SMS to Actives
                        {displayCounts.sms !== null && (
                          <span className="text-xs text-gray-500 font-normal">({displayCounts.sms})</span>
                        )}
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="gov-send-sms-alumni"
                        checked={sendSmsToAlumni}
                        onCheckedChange={(checked) => setSendSmsToAlumni(checked as boolean)}
                      />
                      <Label htmlFor="gov-send-sms-alumni" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5 text-gray-500" />
                        SMS to Alumni
                        {displayCounts.alumniSms !== null && (
                          <span className="text-xs text-gray-500 font-normal">({displayCounts.alumniSms})</span>
                        )}
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="gov-send-email-members"
                        checked={sendEmailToMembers}
                        onCheckedChange={(checked) => setSendEmailToMembers(checked as boolean)}
                      />
                      <Label htmlFor="gov-send-email-members" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-gray-500" />
                        Email to Actives
                        {displayCounts.email !== null && (
                          <span className="text-xs text-gray-500 font-normal">({displayCounts.email})</span>
                        )}
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="gov-send-email-alumni"
                        checked={sendEmailToAlumni}
                        onCheckedChange={(checked) => setSendEmailToAlumni(checked as boolean)}
                      />
                      <Label htmlFor="gov-send-email-alumni" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-gray-500" />
                        Email to Alumni
                        {displayCounts.alumniEmail !== null && (
                          <span className="text-xs text-gray-500 font-normal">({displayCounts.alumniEmail})</span>
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
                          <div key={ch.chapter_id} className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0">
                            <span className="font-medium truncate max-w-[140px]">{ch.chapter_name}</span>
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
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
