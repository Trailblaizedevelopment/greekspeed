'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Megaphone, Send, Mail, Smartphone, X } from 'lucide-react';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { useAnnouncements } from '@/lib/hooks/useAnnouncements';
import type { CreateAnnouncementData } from '@/types/announcements';
import { toast } from 'react-toastify';
import { useAuth } from '@/lib/supabase/auth-context';
import { useAnnouncementImageAttachment } from '@/lib/hooks/useAnnouncementImageAttachment';
import { AnnouncementImageAttachmentField } from './AnnouncementImageAttachmentField';

export function SendAnnouncementButton() {
  const { session } = useAuth();
  const chapterId = useScopedChapterId();
  const { createAnnouncement, loading: announcementsLoading } = useAnnouncements(chapterId || null);

  const [showModal, setShowModal] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementType, setAnnouncementType] = useState<'general' | 'urgent' | 'event' | 'academic'>('general');
  const [sendSmsToMembers, setSendSmsToMembers] = useState(false);
  const [sendSmsToAlumni, setSendSmsToAlumni] = useState(false);
  const [sendEmailToMembers, setSendEmailToMembers] = useState(false);
  const [sendEmailToAlumni, setSendEmailToAlumni] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [emailRecipientCount, setEmailRecipientCount] = useState<number | null>(null);
  const [memberSmsRecipientCount, setMemberSmsRecipientCount] = useState<number | null>(null);
  const [alumniSmsRecipientCount, setAlumniSmsRecipientCount] = useState<number | null>(null);
  const [alumniEmailRecipientCount, setAlumniEmailRecipientCount] = useState<number | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

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
    const fetchRecipientCounts = async () => {
      if (!chapterId || !session?.access_token || !showModal) return;

      setLoadingRecipients(true);
      try {
        const response = await fetch(
          `/api/announcements/recipient-counts?chapter_id=${chapterId}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setEmailRecipientCount(data.email_recipients);
          setMemberSmsRecipientCount(data.sms_recipients);
          setAlumniSmsRecipientCount(
            typeof data.alumni_sms_recipients === 'number' ? data.alumni_sms_recipients : null
          );
          setAlumniEmailRecipientCount(
            typeof data.alumni_email_recipients === 'number' ? data.alumni_email_recipients : null
          );
        }
      } catch (error) {
        console.error('Error fetching recipient counts:', error);
      } finally {
        setLoadingRecipients(false);
      }
    };

    fetchRecipientCounts();
  }, [chapterId, session?.access_token, showModal]);

  const handleSendAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcement.trim()) {
      toast.error('Please fill in both title and content');
      return;
    }

    if (!sendSmsToMembers && !sendSmsToAlumni && !sendEmailToMembers && !sendEmailToAlumni) {
      toast.error('Please select at least one delivery method');
      return;
    }

    setIsSubmitting(true);
    try {
      const announcementData: CreateAnnouncementData = {
        title: announcementTitle.trim(),
        content: announcement.trim(),
        announcement_type: announcementType,
        send_sms: sendSmsToMembers,
        send_sms_to_alumni: sendSmsToAlumni,
        send_email_to_members: sendEmailToMembers,
        send_email_to_alumni: sendEmailToAlumni,
        metadata: buildMetadata(),
      };

      await createAnnouncement(announcementData);
      toast.success('Announcement sent successfully!');

      setAnnouncement('');
      setAnnouncementTitle('');
      setAnnouncementType('general');
      setSendSmsToMembers(false);
      setSendSmsToAlumni(false);
      setSendEmailToMembers(false);
      setSendEmailToAlumni(false);
      resetAttachment();
      setShowModal(false);
    } catch (error) {
      toast.error('Failed to send announcement');
      console.error('Error sending announcement:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayCounts = {
    sms: memberSmsRecipientCount,
    alumniSms: alumniSmsRecipientCount,
    email: emailRecipientCount,
    alumniEmail: alumniEmailRecipientCount,
  };

  const formContent = (idSuffix: string) => (
    <>
      <div className="space-y-2">
        <Input
          placeholder="Announcement title..."
          value={announcementTitle}
          onChange={(e) => setAnnouncementTitle(e.target.value)}
          className="w-full border-gray-200 focus:border-brand-primary focus:ring-brand-primary"
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
        placeholder="Write a chapter announcement..."
        value={announcement}
        onChange={(e) => setAnnouncement(e.target.value)}
        className="min-h-[120px] w-full border-gray-200 focus:border-brand-primary focus:ring-brand-primary resize-none"
      />

      <AnnouncementImageAttachmentField
        idSuffix={idSuffix}
        pendingImage={pendingImage}
        imageAlt={imageAlt}
        onAltChange={setImageAlt}
        imageUploading={imageUploading}
        acceptTypes={acceptTypes}
        onFileChange={handleFileChange}
        processImageFile={processImageFile}
        onRemove={removeImage}
        disabled={isSubmitting || announcementsLoading}
      />

      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">
          Delivery Options
        </p>

        <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
          <Checkbox
            id={`send-sms-members-${idSuffix}`}
            checked={sendSmsToMembers}
            onCheckedChange={(checked) => setSendSmsToMembers(checked as boolean)}
          />
          <Label
            htmlFor={`send-sms-members-${idSuffix}`}
            className="text-sm cursor-pointer font-medium flex items-center gap-1.5"
          >
            <Smartphone className="h-3.5 w-3.5 text-gray-500" />
            SMS to Actives
            {displayCounts.sms !== null && displayCounts.sms !== undefined && (
              <span className="text-xs text-gray-400 font-normal">({displayCounts.sms})</span>
            )}
          </Label>
        </div>

        <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
          <Checkbox
            id={`send-sms-alumni-${idSuffix}`}
            checked={sendSmsToAlumni}
            onCheckedChange={(checked) => setSendSmsToAlumni(checked as boolean)}
          />
          <Label
            htmlFor={`send-sms-alumni-${idSuffix}`}
            className="text-sm cursor-pointer font-medium flex items-center gap-1.5"
          >
            <Smartphone className="h-3.5 w-3.5 text-gray-500" />
            SMS to Alumni
            {displayCounts.alumniSms !== null && displayCounts.alumniSms !== undefined && (
              <span className="text-xs text-gray-400 font-normal">({displayCounts.alumniSms})</span>
            )}
          </Label>
        </div>

        <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
          <Checkbox
            id={`send-email-members-${idSuffix}`}
            checked={sendEmailToMembers}
            onCheckedChange={(checked) => setSendEmailToMembers(checked as boolean)}
          />
          <Label
            htmlFor={`send-email-members-${idSuffix}`}
            className="text-sm cursor-pointer font-medium flex items-center gap-1.5"
          >
            <Mail className="h-3.5 w-3.5 text-gray-500" />
            Email to Actives
            {displayCounts.email !== null && displayCounts.email !== undefined && (
              <span className="text-xs text-gray-400 font-normal">({displayCounts.email})</span>
            )}
          </Label>
        </div>

        <div className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
          <Checkbox
            id={`send-email-alumni-${idSuffix}`}
            checked={sendEmailToAlumni}
            onCheckedChange={(checked) => setSendEmailToAlumni(checked as boolean)}
          />
          <Label
            htmlFor={`send-email-alumni-${idSuffix}`}
            className="text-sm cursor-pointer font-medium flex items-center gap-1.5"
          >
            <Mail className="h-3.5 w-3.5 text-gray-500" />
            Email to Alumni
            {displayCounts.alumniEmail !== null && displayCounts.alumniEmail !== undefined && (
              <span className="text-xs text-gray-400 font-normal">({displayCounts.alumniEmail})</span>
            )}
          </Label>
        </div>

        {loadingRecipients && (
          <p className="text-xs text-gray-400 pl-1">Loading recipient counts...</p>
        )}
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full sm:hidden flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-brand-primary hover:bg-brand-primary-hover transition-colors duration-200 shadow-md"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
          <Megaphone className="h-4 w-4 text-white" />
        </div>
        <span className="text-white font-medium text-sm">Send Announcement</span>
      </button>

      <button
        onClick={() => setShowModal(true)}
        className="hidden sm:flex w-full items-center justify-center gap-2 px-4 py-3 rounded-full bg-brand-primary hover:bg-brand-primary-hover transition-colors duration-200 shadow-md"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
          <Megaphone className="h-4 w-4 text-white" />
        </div>
        <span className="text-white font-medium text-sm">Send Announcement</span>
      </button>

      <Sheet open={showModal} onOpenChange={setShowModal}>
        <SheetContent
          side="bottom"
          backdropClassName="sm:hidden"
          className="sm:hidden rounded-t-2xl flex flex-col p-0 max-h-[85dvh] border-0"
        >
          <div className="bg-brand-primary px-4 py-4 flex-shrink-0 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Megaphone className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-base font-semibold text-white">Send Announcement</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">{formContent('mobile')}</div>

          <div className="flex flex-row gap-3 flex-shrink-0 border-t border-gray-200 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
            <Button
              variant="outline"
              className="flex-1 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors duration-200"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-full bg-brand-primary hover:bg-brand-primary-hover transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSendAnnouncement}
              disabled={isSubmitting || announcementsLoading}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {showModal && (
        <>
          <div
            className="hidden sm:block fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
            aria-hidden
          />

          <div className="hidden sm:flex fixed inset-0 z-[9999] items-center justify-center p-4">
            <div className="relative bg-white shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden">
              <div className="bg-brand-primary p-6 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <Megaphone className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">Send Announcement</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="text-white/80 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">{formContent('desktop')}</div>

              <div className="flex flex-row gap-3 flex-shrink-0 border-t border-gray-200 p-6">
                <Button
                  variant="outline"
                  className="rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-full bg-brand-primary hover:bg-brand-primary-hover transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleSendAnnouncement}
                  disabled={isSubmitting || announcementsLoading}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isSubmitting ? 'Sending...' : 'Send Announcement'}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
