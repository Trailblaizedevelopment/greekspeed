'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { X, Image, MoreHorizontal, Trash2 } from 'lucide-react';
import type { CreatePostRequest, Post } from '@/types/posts';
import ImageWithFallback from '@/components/figma/ImageWithFallback';
import { LinkPreviewCard } from '@/components/features/social/LinkPreviewCard';
import MentionTextarea from '@/components/features/social/MentionTextarea';
import { PostImageService } from '@/lib/services/postImageService';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { cn } from '@/lib/utils';

export interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAvatar?: string;
  userName?: string;
  /** Create flow */
  onSubmit?: (postData: CreatePostRequest) => Promise<void>;
  /** Edit flow */
  editPost?: Post | null;
  /** Resolved URLs for read-only image strip (parent may fetch for slim-feed posts). */
  existingImageUrls?: string[];
  onSaveEdit?: (content: string) => Promise<void>;
  /** Opens delete flow from edit header ⋯ menu */
  onEditDelete?: () => void;
}

const MAX_IMAGES = 10;

/** Set true to use bottom drawer on mobile; edit mode uses same header/footer logic. */
const USE_CREATE_POST_DRAWER_MOBILE = false;

/** Mention sheet is portaled to `document.body`; Radix Dialog must ignore those pointers. */
function isPortaledMentionSheetTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest('[data-mention-sheet]') !== null ||
    target.closest('[data-app-sheet-backdrop]') !== null
  );
}

function preventDialogDismissIfMentionSheetOutside(e: {
  preventDefault: () => void;
  detail: { originalEvent: Event };
}): void {
  const t = e.detail?.originalEvent?.target ?? null;
  if (isPortaledMentionSheetTarget(t)) e.preventDefault();
}

export function CreatePostModal({
  isOpen,
  onClose,
  onSubmit,
  userAvatar,
  userName,
  editPost,
  existingImageUrls = [],
  onSaveEdit,
  onEditDelete,
}: CreatePostModalProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const isEditMode = Boolean(editPost);

  const [content, setContent] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sanitizeContent = (value: string) =>
    value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const sanitizedContent = sanitizeContent(content);

  useEffect(() => {
    if (!isOpen) {
      setIsInputFocused(false);
      setPreviewUrls((current) => {
        current.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      setContent('');
      setImageFiles([]);
      setUploadError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && editPost) {
      setContent(sanitizeContent(editPost.content ?? ''));
    }
  }, [isOpen, editPost?.id, editPost?.content]);

  const determinePostType = (nextContent: string, nextImageCount: number) => {
    const trimmedContent = nextContent.trim();
    if (trimmedContent && nextImageCount > 0) return 'text_image';
    if (nextImageCount > 0) return 'image';
    if (trimmedContent) return 'text';
    return 'text';
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isEditMode) return;
    const files = event.target.files;
    if (!files || files.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadError(null);
    const fileArray = Array.from(files);
    const remainingSlots = MAX_IMAGES - imageFiles.length;

    if (fileArray.length > remainingSlots) {
      setUploadError(
        `You can only add up to ${MAX_IMAGES} images. You have ${imageFiles.length} image(s) and tried to add ${fileArray.length}. Please select ${remainingSlots} or fewer.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const validFiles: File[] = [];
    const maxFileSize = 10 * 1024 * 1024;

    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) {
        setUploadError(`${file.name} is not a valid image file.`);
        continue;
      }
      if (file.size > maxFileSize) {
        setUploadError(`${file.name} is too large. Maximum size is 10MB.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const newPreviews = validFiles.map((f) => URL.createObjectURL(f));
    setImageFiles((prev) => [...prev, ...validFiles]);
    setPreviewUrls((prev) => [...prev, ...newPreviews]);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (indexToRemove: number) => {
    URL.revokeObjectURL(previewUrls[indexToRemove]);
    const newFiles = imageFiles.filter((_, i) => i !== indexToRemove);
    const newPreviews = previewUrls.filter((_, i) => i !== indexToRemove);
    setImageFiles(newFiles);
    setPreviewUrls(newPreviews);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateSubmit = async () => {
    if (isEditMode || !onSubmit) return;
    const sanitized = sanitizeContent(content);
    if (!sanitized.trim() && imageFiles.length === 0) return;
    if (!user) {
      setUploadError('You must be logged in to create a post.');
      return;
    }

    setIsSubmitting(true);
    setUploadError(null);

    try {
      let uploadedUrls: string[] = [];
      if (imageFiles.length > 0) {
        try {
          uploadedUrls = await PostImageService.uploadImages(imageFiles, user.id);
        } catch (uploadErr: unknown) {
          const message =
            uploadErr instanceof Error ? uploadErr.message : 'Failed to upload images. Please try again.';
          setUploadError(message);
          setIsSubmitting(false);
          return;
        }
      }

      await onSubmit({
        content: sanitized,
        post_type: determinePostType(sanitized, uploadedUrls.length),
        image_url: uploadedUrls[0] || undefined,
        metadata: {
          image_urls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
          image_count: uploadedUrls.length,
        },
      });

      onClose();
    } catch (error) {
      console.error('Failed to create post:', error);
      setUploadError('Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSave = async () => {
    if (!isEditMode || !editPost || !onSaveEdit) return;
    const trimmed = sanitizeContent(content).trim();
    if (editPost.post_type === 'text' && !trimmed) return;

    setIsSubmitting(true);
    setUploadError(null);
    try {
      await onSaveEdit(trimmed);
      onClose();
    } catch (error) {
      console.error('Failed to update post:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to update post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmitCreate =
    (sanitizedContent.trim() || previewUrls.length > 0) && !isSubmitting;
  const canSubmitEdit = useMemo(() => {
    if (!isEditMode || !editPost) return false;
    const trimmed = sanitizedContent.trim();
    if (editPost.post_type === 'text' && !trimmed) return false;
    return !isSubmitting;
  }, [isEditMode, editPost, sanitizedContent, isSubmitting]);

  const linkPreviewsEdit = editPost?.metadata?.link_previews;

  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const renderComposerIdentity = (options?: { compact?: boolean }) => {
    const compact = options?.compact ?? false;
    return (
      <div
        className={cn(
          'flex gap-3 sm:gap-3',
          compact ? 'items-center' : 'items-start mt-4',
        )}
      >
        <div className="w-12 h-12 sm:w-11 sm:h-11 bg-primary-100/70 rounded-full flex items-center justify-center text-brand-primary-hover text-base sm:text-sm font-semibold shrink-0 overflow-hidden ring-2 ring-white">
          {userAvatar ? (
            <ImageWithFallback
              src={userAvatar}
              alt={userName || 'User'}
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          ) : (
            userName?.charAt(0) || 'U'
          )}
        </div>
        <div className={cn('flex-1 min-w-0', compact && 'flex items-center')}>
          <p
            className={cn(
              'text-slate-900',
              compact
                ? 'text-lg sm:text-xl font-semibold leading-none'
                : 'font-medium text-base sm:text-sm',
            )}
          >
            {userName || 'You'}
          </p>
          {!isEditMode && !compact && (
            <Badge className="mt-2 inline-flex items-center rounded-full border border-slate-200/80 bg-slate-100/70 px-3 py-1 text-xs font-medium text-slate-600">
              Post to Chapter
            </Badge>
          )}
        </div>
      </div>
    );
  };

  const editThreadsHeader = (
    <div className="shrink-0 border-b border-slate-200/50">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2 sm:py-2.5 pl-4 sm:pl-6 pr-11 sm:pr-14">
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start h-9 px-2 text-slate-600 hover:text-slate-900"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <h2 className="text-center text-base font-semibold tracking-tight text-slate-900">
          Edit post
        </h2>
        <div className="justify-self-end flex items-center justify-end min-w-[2.5rem]">
          {onEditDelete ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 shrink-0 rounded-full p-0 text-slate-600"
                  aria-label="More options"
                  disabled={isSubmitting}
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuItem
                  onClick={() => {
                    onEditDelete();
                  }}
                  className="gap-2 text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete post
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="w-9" aria-hidden />
          )}
        </div>
      </div>
      <div className="px-6 sm:px-8 pb-2 pt-0">
        {renderComposerIdentity({ compact: true })}
      </div>
    </div>
  );

  const createHeaderBlock = (
    <div className="shrink-0 p-6 sm:p-8 pb-4 sm:pb-4 border-b border-slate-200/50">
      <div className="pb-2">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Create a post</h2>
        <p className="text-sm text-slate-400 mt-1">Share an update with your chapter</p>
      </div>
      {renderComposerIdentity()}
    </div>
  );

  const bodyContent = (
    <div
      className={cn(
        'flex-1 overflow-y-auto min-h-0 px-6 sm:px-8',
        isEditMode ? 'pt-2 pb-4 sm:pt-3 sm:pb-6' : 'py-4 sm:py-6',
      )}
    >
      <div className="space-y-4 sm:space-y-3">
        <MentionTextarea
          value={content}
          onChange={(nextValue) => {
            setContent(sanitizeContent(nextValue));
          }}
          chapterId={profile?.chapter_id ?? undefined}
          placeholder={isEditMode ? undefined : 'What do you want to talk about?'}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          className="min-h-[120px] sm:min-h-[100px] resize-none rounded-2xl border border-transparent bg-slate-50/80 p-5 text-base sm:text-lg text-slate-800 placeholder:text-slate-400 focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-200 transition"
          disabled={isSubmitting}
        />

        {uploadError && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 shrink-0">
            {uploadError}
          </div>
        )}

        {isEditMode &&
          Array.isArray(linkPreviewsEdit) &&
          linkPreviewsEdit.length > 0 && (
            <div className="space-y-3">
              {linkPreviewsEdit.map((preview, idx) => (
                <LinkPreviewCard key={`${preview.url}-${idx}`} preview={preview} />
              ))}
            </div>
          )}

        {isEditMode && existingImageUrls.length > 0 && (
          <div className="relative shrink-0">
            <div
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
              style={{ maxHeight: '200px', WebkitOverflowScrolling: 'touch' }}
            >
              {existingImageUrls.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="relative shrink-0 w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Post image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {!isEditMode && previewUrls.length > 0 && (
          <div className="relative shrink-0">
            <div
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
              style={{
                maxHeight: '140px',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {previewUrls.map((url, index) => (
                <div
                  key={index}
                  className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Post image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <Button
                    variant="ghost"
                    onClick={() => handleRemoveImage(index)}
                    className="absolute top-1 right-1 h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-black/70 hover:bg-black/90 p-0 flex items-center justify-center transition-all z-10"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    <X className="h-4 w-4 sm:h-5 sm:w-5 text-white stroke-[2.5]" />
                  </Button>
                </div>
              ))}
            </div>
            {previewUrls.length < MAX_IMAGES && (
              <p className="text-xs text-slate-500 mt-2">
                {previewUrls.length} of {MAX_IMAGES} images ({MAX_IMAGES - previewUrls.length}{' '}
                remaining)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const footerCreate = (
    <div className="shrink-0 border-t border-slate-200/70 bg-slate-50/70 p-4 sm:p-3 shadow-inner">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={imageFiles.length >= MAX_IMAGES || isSubmitting}
            className="h-11 sm:h-9 rounded-full border border-slate-200 bg-white/90 px-5 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Image className="h-5 w-5 sm:h-4 mr-2" />
            <span className="text-sm font-medium">Photo</span>
          </Button>
        </div>

        <Button
          onClick={handleCreateSubmit}
          disabled={!canSubmitCreate}
          className="w-full sm:w-auto h-12 sm:h-10 rounded-full bg-brand-primary px-8 text-sm font-semibold tracking-wide text-white shadow-[0_18px_45px_-24px_rgba(30,64,175,0.9)] transition-all duration-200 hover:bg-brand-primary-hover hover:-translate-y-0.5 hover:shadow-[0_22px_55px_-28px_rgba(30,64,175,0.85)] disabled:translate-y-0 disabled:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Posting…' : 'Post'}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );

  const footerEdit = (
    <div className="shrink-0 border-t border-slate-200/70 bg-slate-50/70 p-4 sm:p-3 shadow-inner">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-end gap-3">
        <Button
          type="button"
          onClick={handleEditSave}
          disabled={!canSubmitEdit}
          className="w-full sm:w-auto h-12 sm:h-10 rounded-full bg-brand-primary px-8 text-sm font-semibold tracking-wide text-white shadow-[0_18px_45px_-24px_rgba(30,64,175,0.9)] transition-all duration-200 hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Saving…' : 'Done'}
        </Button>
      </div>
    </div>
  );

  const showDrawerFooter = isEditMode || !isInputFocused;

  if (mounted && isMobile && USE_CREATE_POST_DRAWER_MOBILE) {
    return (
      <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()} direction="bottom" modal dismissible>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40 transition-opacity" />
          <Drawer.Content className="bg-white flex flex-col z-[10000] fixed bottom-0 left-0 right-0 max-h-[85dvh] rounded-t-[20px] shadow-2xl border border-gray-200 outline-none">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-2" aria-hidden />
            {isEditMode ? editThreadsHeader : createHeaderBlock}
            {bodyContent}
            {showDrawerFooter && (isEditMode ? footerEdit : footerCreate)}
            {!isEditMode && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[600px] max-w-[85vw] max-h-[90vh] sm:max-h-[80vh] overflow-hidden border border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-[0_28px_90px_-40px_rgba(15,23,42,0.55)] sm:rounded-3xl rounded-2xl p-0 flex flex-col"
        onPointerDownOutside={preventDialogDismissIfMentionSheetOutside}
        onInteractOutside={preventDialogDismissIfMentionSheetOutside}
      >
        {isEditMode && (
          <DialogHeader className="sr-only">
            <DialogTitle>Edit post</DialogTitle>
          </DialogHeader>
        )}
        {isEditMode ? (
          <>
            {editThreadsHeader}
            {bodyContent}
            {footerEdit}
          </>
        ) : (
          <>
            <div className="shrink-0 p-6 sm:p-8 pb-4 sm:pb-4 border-b border-slate-200/50">
              <DialogHeader className="pb-2 text-left">
                <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
                  Create a post
                </DialogTitle>
                <p className="text-sm text-slate-400 mt-1">Share an update with your chapter</p>
              </DialogHeader>
              {renderComposerIdentity()}
            </div>
            {bodyContent}
            {footerCreate}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
