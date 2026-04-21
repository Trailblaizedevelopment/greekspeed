'use client';

import { memo, useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Trash2, X, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { PostActionsMenu } from './PostActionsMenu';
import { Post, PostComment, MentionData } from '@/types/posts';
import { formatDistanceToNow } from 'date-fns';
import { LinkPreviewCard } from './LinkPreviewCard';
import { MentionText } from './MentionText';
import { ClickableAvatar } from '@/components/features/user-profile/ClickableAvatar';
import { ClickableUserName } from '@/components/features/user-profile/ClickableUserName';
import { useAuth } from '@/lib/supabase/auth-context';
import { useComments } from '@/lib/hooks/useComments';
import { useCommentCount } from '@/lib/hooks/useCommentCount';
import { useProfile } from '@/lib/contexts/ProfileContext';
import MentionTextarea, { type MentionTextareaHandle } from './MentionTextarea';
import { PostImageGrid } from './PostImageGrid';
import { cn } from '@/lib/utils';

/* -----------------------------------------------------------------------
 * 9a: Lazy-load heavy modals via next/dynamic.
 *     JS for these chunks is fetched ONLY when the user actually opens
 *     the modal — keeps the initial PostCard bundle small.
 * --------------------------------------------------------------------- */
const LazyDeletePostModal = dynamic(
  () => import('./DeletePostModal').then((mod) => ({ default: mod.DeletePostModal })),
  { ssr: false },
);

const MAX_COLLAPSED_CHARS = 220;

/* -----------------------------------------------------------------------
 * 9a: Image Lightbox — rendered via portal, mounted ONLY when user clicks
 *     an image. Previously it was an inline function component that was
 *     re-created on every PostCard render (even when closed).
 * --------------------------------------------------------------------- */
interface ImageLightboxProps {
  imageUrls: string[];
  selectedIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

function ImageLightbox({
  imageUrls,
  selectedIndex,
  onClose,
  onPrev,
  onNext,
}: ImageLightboxProps) {
  if (typeof document === 'undefined' || imageUrls.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Close Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 h-10 w-10 p-0 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/20"
        aria-label="Close image viewer"
      >
        <X className="h-5 w-5" />
      </Button>

      {/* Navigation Buttons (only show if multiple images) */}
      {imageUrls.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-4 z-10 h-12 w-12 p-0 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/20"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-4 z-10 h-12 w-12 p-0 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/20"
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </>
      )}

      {/* Image Container */}
      <div
        className="relative max-w-[95vw] max-h-[95vh] w-full h-full flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrls[selectedIndex]}
          alt={`Post image ${selectedIndex + 1} of ${imageUrls.length}`}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>

      {/* Image Counter (only show if multiple images) */}
      {imageUrls.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
          {selectedIndex + 1} / {imageUrls.length}
        </div>
      )}
    </div>,
    document.body,
  );
}

/* -----------------------------------------------------------------------
 * PostCard (inner implementation)
 * --------------------------------------------------------------------- */
interface PostCardProps {
  post: Post;
  onLike: (postId: string) => void;
  onDelete?: (postId: string) => void;
  onEdit?: (postId: string) => void;
  onReport?: (postId: string) => void;
  /** Dashboard feed: open block confirmation (API + refresh handled by parent). */
  onBlockAuthor?: (post: Post) => void;
  onBookmark?: (postId: string) => void;
  onCommentAdded?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  variant?: 'default' | 'profile' | 'feed';
  showDivider?: boolean;
  /** e.g. virtualized feed row remeasure when inline comment composer opens/closes */
  onLayoutInvalidate?: () => void;
}

function PostCardInner({
  post,
  onLike,
  onDelete,
  onEdit,
  onReport,
  onBlockAuthor,
  onBookmark,
  onCommentAdded,
  isExpanded: isExpandedProp,
  onToggleExpand,
  variant = 'default',
  showDivider = false,
  onLayoutInvalidate,
}: PostCardProps) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [localExpanded, setLocalExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isExpanded = isExpandedProp ?? localExpanded;
  const handleExpandToggle = onToggleExpand ?? (() => setLocalExpanded((prev) => !prev));
  const router = useRouter();

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Image viewer state
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // On-demand image load when feed omitted URLs (slim feed)
  const [loadedImageUrls, setLoadedImageUrls] = useState<string[] | null>(null);
  const { getAuthHeaders } = useAuth();

  // Extract image URLs from post (from feed payload)
  const imageUrls = useMemo(() => {
    if (
      post.metadata?.image_urls &&
      Array.isArray(post.metadata.image_urls) &&
      post.metadata.image_urls.length > 0
    ) {
      return post.metadata.image_urls;
    }
    if (post.image_url) {
      return [post.image_url];
    }
    return [];
  }, [post.image_url, post.metadata, post.has_image]);

  // Resolved URLs: use on-demand loaded URLs when post has_image but feed had none
  const resolvedImageUrls = useMemo(() => {
    if (post.has_image && imageUrls.length === 0 && loadedImageUrls !== null) {
      return loadedImageUrls;
    }
    return imageUrls;
  }, [post.has_image, imageUrls, loadedImageUrls]);

  const isImageOnly = useMemo(() => {
    const hasContent = post.content?.trim();
    const hasLinkPreviews = (post.metadata?.link_previews?.length ?? 0) > 0;
    return (
      post.post_type === 'image' ||
      (resolvedImageUrls.length > 0 && !hasContent && !hasLinkPreviews)
    );
  }, [post.post_type, post.content, post.metadata?.link_previews, resolvedImageUrls.length]);

  /** Skeleton only while optional /image fallback is in flight; not when URLs are already on the post. */
  const showImageLoadingSkeleton = useMemo(
    () =>
      !!post.has_image && imageUrls.length === 0 && loadedImageUrls === null,
    [post.has_image, imageUrls.length, loadedImageUrls],
  );

  // Fallback: load image URLs when payload omitted them (e.g. stale cache)
  useEffect(() => {
    if (!post.has_image || imageUrls.length > 0 || loadedImageUrls !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = getAuthHeaders();
        const res = await fetch(`/api/posts/${post.id}/image`, { headers });
        if (cancelled) return;
        if (!res.ok) {
          setLoadedImageUrls([]);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const urls =
          Array.isArray(data.image_urls) && data.image_urls.length > 0
            ? data.image_urls
            : data.image_url
              ? [data.image_url]
              : [];
        setLoadedImageUrls(urls);
      } catch {
        if (!cancelled) setLoadedImageUrls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post.id, post.has_image, imageUrls.length, loadedImageUrls, getAuthHeaders]);

  // Stable callbacks for image lightbox
  const handleImageClick = useCallback((index: number) => {
    setSelectedImageIndex(index);
    setIsImageModalOpen(true);
  }, []);

  const handlePrevImage = useCallback(() => {
    setSelectedImageIndex((prev) =>
      prev > 0 ? prev - 1 : resolvedImageUrls.length - 1,
    );
  }, [resolvedImageUrls.length]);

  const handleNextImage = useCallback(() => {
    setSelectedImageIndex((prev) =>
      prev < resolvedImageUrls.length - 1 ? prev + 1 : 0,
    );
  }, [resolvedImageUrls.length]);

  const handleCloseLightbox = useCallback(() => {
    setIsImageModalOpen(false);
  }, []);

  const { displayContent, shouldTruncate } = useMemo(() => {
    const content = post.content ?? '';

    if (content.length <= MAX_COLLAPSED_CHARS) {
      return {
        displayContent: content,
        shouldTruncate: false,
      };
    }

    const truncated = content.slice(0, MAX_COLLAPSED_CHARS).trimEnd();

    return {
      displayContent: isExpanded ? content : `${truncated}…`,
      shouldTruncate: true,
    };
  }, [isExpanded, post.content]);

  const renderPostContent = (textClassName: string, buttonClassName: string) => {
    if (!post.content) return null;

    // Get URLs that have previews - we'll hide these from the content
    const previewUrls = new Set(
      (post.metadata?.link_previews || []).map((preview: any) => preview.url),
    );
    const mentions: MentionData[] | undefined = post.metadata?.mentions;

    // Convert URLs to clickable links, but skip URLs that have previews
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const contentWithLinks = displayContent
      .split(urlRegex)
      .map((part, i) => {
        if (part.match(urlRegex)) {
          const cleanUrl = part.replace(/[.,;:!?]+$/, '');
          if (previewUrls.has(cleanUrl)) {
            return null;
          }
          return (
            <a
              key={i}
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-accent hover:text-accent-700 hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return (
          <MentionText key={i} content={part} mentions={mentions} />
        );
      })
      .filter(Boolean);

    return (
      <div className="space-y-2">
        <p className={`${textClassName} break-words whitespace-pre-wrap`}>
          {contentWithLinks}
        </p>
        {shouldTruncate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleExpandToggle();
            }}
            className={buttonClassName}
          >
            {isExpanded ? 'View less' : 'View more'}
          </button>
        )}
      </div>
    );
  };

  const [showCommentComposer, setShowCommentComposer] = useState(false);
  const commentComposerMobileRef = useRef<HTMLDivElement | null>(null);
  const commentComposerDesktopRef = useRef<HTMLDivElement | null>(null);
  const inlineCommentTextareaMobileRef = useRef<MentionTextareaHandle | null>(null);
  const inlineCommentTextareaDesktopRef = useRef<MentionTextareaHandle | null>(null);

  const isInsideCommentComposer = useCallback((node: Node | null) => {
    if (!node) return false;
    if (
      commentComposerMobileRef.current?.contains(node) ||
      commentComposerDesktopRef.current?.contains(node)
    ) {
      return true;
    }
    // MentionTextarea portals the suggestion list to document.body; treat it as part of the composer
    // so capture-phase pointerdown does not close the inline composer before a row can be selected.
    if (
      node instanceof Element &&
      (node.closest('[data-mention-suggestions]') || node.closest('[data-mention-sheet]'))
    ) {
      return true;
    }
    return false;
  }, []);
  const postCardRef = useRef<HTMLDivElement | null>(null);
  const [showHeartOverlay, setShowHeartOverlay] = useState(false);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  const commentsPreview = post.comments_preview ?? [];
  const liveCommentCount = useCommentCount(post.id, post.comments_count ?? 0);

  const { comments: commentsFromHook, loading: commentsLoading, createComment } = useComments(post.id, {
    enabled: showCommentComposer,
    limit: 4,
  });

  const previewCommentsFromHook = useMemo(() => {
    if (commentsFromHook.length === 0) return [];
    const sorted = [...commentsFromHook].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return sorted.slice(0, 4);
  }, [commentsFromHook]);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showCommentComposer) return;
    const onPointerDown = (ev: PointerEvent) => {
      if (!isInsideCommentComposer(ev.target as Node)) {
        setShowCommentComposer(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [showCommentComposer, isInsideCommentComposer]);

  useEffect(() => {
    if (!showCommentComposer) return;
    const id = requestAnimationFrame(() => {
      const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches;
      if (desktop) {
        inlineCommentTextareaDesktopRef.current?.focus();
      } else {
        inlineCommentTextareaMobileRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [showCommentComposer]);

  const prevShowCommentComposer = useRef(showCommentComposer);
  useLayoutEffect(() => {
    if (prevShowCommentComposer.current === showCommentComposer) return;
    prevShowCommentComposer.current = showCommentComposer;
    onLayoutInvalidate?.();
  }, [showCommentComposer, onLayoutInvalidate]);

  const toggleCommentComposer = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCommentComposer((v) => !v);
  }, []);

  const formatTimestamp = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'recently';
    }
  };

  const formatCommentSnippet = (content: string) => {
    if (!content) return '';
    const trimmed = content.trim();
    if (trimmed.length <= 140) return trimmed;
    return `${trimmed.slice(0, 137)}…`;
  };

  const linkifyCommentContent = (content: string, previewUrls?: Set<string>, mentions?: MentionData[]) => {
    if (!content) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, i) => {
      const isUrl = /^https?:\/\//.test(part);
      if (isUrl) {
        const cleanUrl = part.replace(/[.,;:!?]+$/, '');
        if (previewUrls?.has(cleanUrl)) return null;
        return (
          <a
            key={i}
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-accent hover:text-accent-700 hover:underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return (
        <MentionText key={i} content={part} mentions={mentions} />
      );
    }).filter(Boolean);
  };

  const renderCommentsPreviewList = (comments: PostComment[]) => {
    if (comments.length === 0) return null;
    return (
      <div className="mt-3 pt-3 border-t border-gray-100/50 space-y-2.5">
        <p className="text-xs font-medium text-gray-500 mb-2">
          {comments.length > 1 ? 'Recent comments' : 'Recent comment'}
        </p>
        <div className="space-y-2.5">
          {comments.map((comment) => (
            <div key={comment.id} className="text-sm">
              <div className="flex items-center gap-2 mb-1">
                {comment.author?.id ? (
                  <ClickableAvatar
                    userId={comment.author.id}
                    avatarUrl={comment.author.avatar_url}
                    fullName={comment.author.full_name}
                    firstName={comment.author.first_name}
                    lastName={comment.author.last_name}
                    size="sm"
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary-100/80 flex items-center justify-center text-brand-primary-hover text-xs font-semibold shrink-0 overflow-hidden ring-2 ring-white">
                    {comment.author?.first_name?.charAt(0) || comment.author?.full_name?.charAt(0) || '?'}
                  </div>
                )}
                {comment.author?.id && comment.author?.full_name ? (
                  <ClickableUserName
                    userId={comment.author.id}
                    fullName={comment.author.full_name}
                    className="font-medium text-gray-900 text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="font-medium text-gray-900 text-sm">
                    {comment.author?.full_name || 'Member'}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {formatTimestamp(comment.created_at)}
                </span>
              </div>
              <p className="text-gray-700 text-sm leading-relaxed pl-10 break-words whitespace-pre-wrap">
                {linkifyCommentContent(
                  formatCommentSnippet(comment.content),
                  comment.metadata?.link_previews?.length
                    ? new Set(comment.metadata.link_previews.map((p: { url: string }) => p.url))
                    : undefined,
                  comment.metadata?.mentions,
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCommentsPreview = () => renderCommentsPreviewList(commentsPreview);

  const handleDeleteClick = () => {
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(post.id);
      setIsDeleteModalOpen(false);
    } catch (error) {
      console.error('Failed to delete post:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setIsDeleteModalOpen(false);
  };

  const handleLikeClick = () => {
    onLike(post.id);
  };

  const openPostView = useCallback(() => {
    router.push(`/dashboard/post/${post.id}`);
  }, [router, post.id]);

  const { profile } = useProfile();
  const [inlineComment, setInlineComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const handleSubmitInlineComment = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = inlineComment.trim();
    if (!content || isSubmittingComment) return;
    setIsSubmittingComment(true);
    try {
      const created = await createComment({ content });
      if (created) {
        setInlineComment('');
        onCommentAdded?.();
      }
    } catch (err) {
      console.error('Inline comment failed:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  }, [inlineComment, isSubmittingComment, createComment, onCommentAdded]);

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [role="button"], img')) return;
    if (showCommentComposer) {
      if (!isInsideCommentComposer(target)) {
        setShowCommentComposer(false);
      }
      return;
    }
    openPostView();
  };

  const handleMobileCardTap = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, [role="button"], img, textarea, form, input')) return;
      if (showCommentComposer) {
        if (!isInsideCommentComposer(target)) {
          setShowCommentComposer(false);
        }
        return;
      }
      if (!isMobile) {
        openPostView();
        return;
      }
      const now = Date.now();
      if (now - lastTapTimeRef.current < 400) {
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapTimeRef.current = 0;
        e.preventDefault();
        e.stopPropagation();
        onLike(post.id);
        if (!post.is_liked) setShowHeartOverlay(true);
        return;
      }
      lastTapTimeRef.current = now;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = setTimeout(() => {
        openPostView();
        singleTapTimerRef.current = null;
      }, 350);
    },
    [isMobile, post.id, onLike, openPostView, showCommentComposer],
  );

  const isFeedVariant = variant === 'feed';
  const cardShellClass = isFeedVariant
    ? 'p-4 sm:p-5'
    : 'rounded-2xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5';
  /** Desktop feed: divider only between rows (carded list inside one shell). */
  const feedDividerClass = isFeedVariant && showDivider ? 'border-b border-gray-200/80' : '';
  /** Mobile feed: hairline under every row (full-width list; outer shell has no card). */
  const feedMobileRowDividerClass = isFeedVariant ? 'border-b border-gray-200/80' : '';

  const commentComposerSectionIdMobile = `post-${post.id}-inline-comment-composer-mobile`;
  const commentComposerSectionIdDesktop = `post-${post.id}-inline-comment-composer-desktop`;

  return (
    <div ref={postCardRef}>
      {/* Mobile Layout — LinkedIn-style post card */}
      <div className={cn('sm:hidden', isFeedVariant ? 'mb-0' : 'mb-3 sm:mb-0')}>
        <div className={cn(cardShellClass, isFeedVariant ? feedMobileRowDividerClass : feedDividerClass)}>
          <div
            className="relative cursor-pointer"
            onClick={isMobile ? handleMobileCardTap : handleCardClick}
          >
          {/* Post Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              {post.author?.id ? (
                <ClickableAvatar
                  userId={post.author.id}
                  avatarUrl={post.author.avatar_url}
                  fullName={post.author.full_name}
                  firstName={post.author.first_name}
                  lastName={post.author.last_name}
                  size="md"
                  className="h-11 w-11 ring-2 ring-white shadow-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="h-11 w-11 bg-primary-100/80 rounded-full flex items-center justify-center text-brand-primary-hover text-sm font-semibold shrink-0 overflow-hidden ring-2 ring-white shadow-sm">
                  {post.author?.first_name?.charAt(0) || 'U'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                {post.author?.id && post.author?.full_name ? (
                  <ClickableUserName
                    userId={post.author.id}
                    fullName={post.author.full_name}
                    className="font-semibold text-gray-900 text-sm break-words block"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <h4 className="font-semibold text-gray-900 text-sm break-words">
                    {post.author?.full_name || 'Unknown User'}
                  </h4>
                )}
                <p className="text-xs text-gray-500">
                  {formatTimestamp(post.created_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center shrink-0">
              <PostActionsMenu
                post={post}
                isAuthor={!!post.is_author}
                onEdit={onEdit}
                onDelete={onDelete}
                onReport={onReport}
                onBlockAuthor={onBlockAuthor}
                onBookmark={onBookmark}
                onDeleteClick={handleDeleteClick}
                useDeleteModal
                isBookmarked={!!post.is_bookmarked}
              />
            </div>
          </div>

          {/* Post Content — image-only media inset inside card (p-4 on shell) */}
          <div className="mb-3">
            {isImageOnly ? (
              <>
                {resolvedImageUrls.length === 0 ? (
                  <div
                    className="w-full aspect-[4/3] bg-gray-100 animate-pulse rounded-xl"
                    style={{ maxHeight: '24rem' }}
                    aria-label="Image loading"
                  />
                ) : (
                  <div className="overflow-hidden rounded-xl">
                    <PostImageGrid
                      imageUrls={resolvedImageUrls}
                      onImageClick={handleImageClick}
                      multiImageSizes="(max-width: 640px) 100vw, 700px"
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl bg-gray-50/30 border border-gray-100/50 p-4 space-y-3">
                {renderPostContent(
                  'text-gray-700 text-sm leading-relaxed',
                  'text-xs font-medium text-brand-primary hover:text-brand-primary-hover transition-colors',
                )}
                {showImageLoadingSkeleton ? (
                  <div
                    className="w-full rounded-3xl aspect-[4/3] bg-gray-100 animate-pulse"
                    style={{ maxHeight: '24rem' }}
                    aria-label="Image loading"
                  />
                ) : (
                  resolvedImageUrls.length > 0 && (
                    <PostImageGrid
                      imageUrls={resolvedImageUrls}
                      onImageClick={handleImageClick}
                      multiImageSizes="(max-width: 640px) 128px, 160px"
                    />
                  )
                )}
                {post.metadata?.link_previews &&
                  post.metadata.link_previews.length > 0 && (
                    <div className="space-y-3">
                      {post.metadata.link_previews.map(
                        (preview: any, index: number) => (
                          <LinkPreviewCard
                            key={preview.url || index}
                            preview={preview}
                            className="max-w-full"
                            hideImage={resolvedImageUrls.length > 0 || !!post.has_image}
                          />
                        ),
                      )}
                    </div>
                  )}
                {renderCommentsPreview()}
              </div>
            )}
          </div>

          <div ref={commentComposerMobileRef}>
            {/* Post Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100/50">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLikeClick();
                  }}
                  className={`gap-2 rounded-full px-3 text-sm transition ${
                    post.is_liked
                      ? 'bg-rose-50 text-rose-500 hover:bg-rose-100'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <motion.span
                    className="inline-flex"
                    initial={false}
                    animate={{ scale: post.is_liked ? [1, 1.25, 1] : 1 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Heart
                      className={`h-4 w-4 ${post.is_liked ? 'fill-current' : ''}`}
                    />
                  </motion.span>
                  <span>{post.likes_count}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={toggleCommentComposer}
                  aria-expanded={showCommentComposer}
                  aria-controls={commentComposerSectionIdMobile}
                  className="gap-2 rounded-full px-3 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  <MessageCircle className="h-4 w-4 text-accent-500" />
                  <span>{liveCommentCount}</span>
                </Button>
              </div>
            </div>

            {showCommentComposer && (
              <div
                id={commentComposerSectionIdMobile}
                className="flex flex-col gap-2 pt-3 border-t border-gray-100/50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-end gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary-100/80 flex items-center justify-center text-brand-primary-hover text-xs font-semibold shrink-0 overflow-hidden ring-2 ring-white">
                    {profile?.avatar_url ? (
                      <Image
                        src={profile.avatar_url}
                        alt={profile.full_name || 'You'}
                        width={32}
                        height={32}
                        className="h-full w-full rounded-full object-cover"
                        sizes="32px"
                      />
                    ) : (
                      (profile?.first_name?.charAt(0) || '?')
                    )}
                  </div>
                  <form
                    className="flex-1 min-w-0"
                    onSubmit={handleSubmitInlineComment}
                  >
                    <div className="flex items-end gap-2">
                      <MentionTextarea
                        ref={inlineCommentTextareaMobileRef}
                        placeholder="Write a comment..."
                        value={inlineComment}
                        onChange={setInlineComment}
                        chapterId={profile?.chapter_id ?? undefined}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmitInlineComment();
                          }
                        }}
                        className="min-h-[36px] max-h-[100px] resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-brand-primary/20"
                        rows={1}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!inlineComment.trim() || isSubmittingComment}
                        className="h-9 w-9 rounded-full p-0 shrink-0 bg-brand-primary text-white hover:bg-brand-primary-hover disabled:opacity-50"
                        aria-label="Send comment"
                      >
                        {isSubmittingComment ? (
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </form>
                </div>
                {(commentsLoading || previewCommentsFromHook.length > 0) && (
                  <div className="min-h-[24px]" onClick={(e) => e.stopPropagation()}>
                    {commentsLoading ? (
                      <div className="flex items-center gap-2 py-2">
                        <div className="h-4 w-4 border-2 border-gray-300 border-t-brand-primary rounded-full animate-spin" />
                        <span className="text-xs text-gray-500">Loading comments...</span>
                      </div>
                    ) : (
                      renderCommentsPreviewList(previewCommentsFromHook)
                    )}
                  </div>
                )}
                {liveCommentCount > previewCommentsFromHook.length && (
                  <button
                    type="button"
                    className="text-left text-xs font-medium text-brand-primary hover:text-brand-primary-hover pt-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCommentComposer(false);
                      openPostView();
                    }}
                  >
                    View all {liveCommentCount} comment{liveCommentCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile double-tap heart overlay (Instagram-style) */}
          {showHeartOverlay && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
              aria-hidden
            >
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.2, 1.2], opacity: [0, 1, 0] }}
                transition={{
                  duration: 0.8,
                  times: [0, 0.25, 1],
                }}
                onAnimationComplete={() => setShowHeartOverlay(false)}
                className="flex items-center justify-center"
              >
                <Heart className="h-24 w-24 fill-rose-500 text-rose-500 drop-shadow-lg" />
              </motion.div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Desktop Layout — LinkedIn-style post card */}
      <div
        className={cn(
          'hidden sm:block',
          isFeedVariant ? 'mb-0' : 'mb-4',
          variant === 'profile' ? 'px-2 sm:px-6' : '',
        )}
      >
        <div className={cn(cardShellClass, feedDividerClass)}>
          <div className="relative cursor-pointer" onClick={handleCardClick}>
            <div className="space-y-4">
          {/* Post Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              {post.author?.id ? (
                <ClickableAvatar
                  userId={post.author.id}
                  avatarUrl={post.author.avatar_url}
                  fullName={post.author.full_name}
                  firstName={post.author.first_name}
                  lastName={post.author.last_name}
                  size="md"
                  className="h-12 w-12 sm:h-11 sm:w-11 ring-2 ring-white shadow-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="h-12 w-12 sm:h-11 sm:w-11 bg-primary-100/80 rounded-full flex items-center justify-center text-brand-primary-hover text-sm font-semibold shrink-0 overflow-hidden ring-2 ring-white shadow-sm">
                  {post.author?.first_name?.charAt(0) || 'U'}
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {post.author?.id && post.author?.full_name ? (
                    <ClickableUserName
                      userId={post.author.id}
                      fullName={post.author.full_name}
                      className="font-semibold text-gray-900 text-base sm:text-sm break-words"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h4 className="font-semibold text-gray-900 text-base sm:text-sm break-words">
                      {post.author?.full_name || 'Unknown User'}
                    </h4>
                  )}
                </div>

                <p className="text-xs uppercase tracking-wide text-gray-400">
                  {formatTimestamp(post.created_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center shrink-0">
              <PostActionsMenu
                post={post}
                isAuthor={!!post.is_author}
                onEdit={onEdit}
                onDelete={onDelete}
                onReport={onReport}
                onBlockAuthor={onBlockAuthor}
                onBookmark={onBookmark}
                onDeleteClick={handleDeleteClick}
                useDeleteModal
                isBookmarked={!!post.is_bookmarked}
              />
            </div>
          </div>

          {/* Post Content — image-only inset inside card; text posts keep inner panel */}
          <div className="space-y-3">
            {isImageOnly ? (
              resolvedImageUrls.length === 0 ? (
                <div
                  className="w-full aspect-[4/3] bg-gray-100 animate-pulse rounded-xl"
                  style={{ maxHeight: '24rem' }}
                  aria-label="Image loading"
                />
              ) : (
                <div className="overflow-hidden rounded-xl">
                  <PostImageGrid
                    imageUrls={resolvedImageUrls}
                    onImageClick={handleImageClick}
                    multiImageSizes="(max-width: 640px) 100vw, 700px"
                  />
                </div>
              )
            ) : (
              <div
                className={cn(
                  'space-y-3',
                  variant === 'profile'
                    ? 'px-0'
                    : 'rounded-2xl bg-gray-50/30 border border-gray-200/80 p-4 sm:p-5',
                )}
              >
                {renderPostContent(
                  'text-gray-700 text-base sm:text-[0.95rem] leading-relaxed',
                  'text-xs font-medium text-brand-primary hover:text-brand-primary-hover transition-colors',
                )}
                {showImageLoadingSkeleton ? (
                  <div
                    className="w-full rounded-3xl aspect-[4/3] bg-gray-100 animate-pulse"
                    style={{ maxHeight: '24rem' }}
                    aria-label="Image loading"
                  />
                ) : (
                  resolvedImageUrls.length > 0 && (
                    <PostImageGrid
                      imageUrls={resolvedImageUrls}
                      onImageClick={handleImageClick}
                      multiImageSizes="(max-width: 640px) 100vw, 700px"
                    />
                  )
                )}
                {post.metadata?.link_previews &&
                  post.metadata.link_previews.length > 0 && (
                    <div className="space-y-3">
                      {post.metadata.link_previews.map(
                        (preview: any, index: number) => (
                          <LinkPreviewCard
                            key={preview.url || index}
                            preview={preview}
                            className="max-w-full"
                            hideImage={resolvedImageUrls.length > 0 || !!post.has_image}
                          />
                        ),
                      )}
                    </div>
                  )}
                {renderCommentsPreview()}
              </div>
            )}
          </div>

          <div ref={commentComposerDesktopRef}>
            {/* Post Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100/50">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLikeClick();
                    if (!post.is_liked) setShowHeartOverlay(true);
                  }}
                  className={`gap-2 rounded-full px-3 py-2 text-sm transition ${
                    post.is_liked
                      ? 'bg-rose-50 text-rose-500 hover:bg-rose-100'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <motion.span
                    className="inline-flex"
                    initial={false}
                    animate={{ scale: post.is_liked ? [1, 1.25, 1] : 1 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Heart
                      className={`h-4 w-4 ${post.is_liked ? 'fill-current' : ''}`}
                    />
                  </motion.span>
                  <span>{post.likes_count}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={toggleCommentComposer}
                  aria-expanded={showCommentComposer}
                  aria-controls={commentComposerSectionIdDesktop}
                  className="gap-2 rounded-full px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  <MessageCircle className="h-4 w-4 text-accent-500" />
                  <span>{liveCommentCount}</span>
                </Button>
              </div>
            </div>

            {showCommentComposer && (
              <div
                id={commentComposerSectionIdDesktop}
                className="flex flex-col gap-2 pt-3 border-t border-gray-100/50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-end gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary-100/80 flex items-center justify-center text-brand-primary-hover text-sm font-semibold shrink-0 overflow-hidden ring-2 ring-white">
                    {profile?.avatar_url ? (
                      <Image
                        src={profile.avatar_url}
                        alt={profile.full_name || 'You'}
                        width={36}
                        height={36}
                        className="h-full w-full rounded-full object-cover"
                        sizes="36px"
                      />
                    ) : (
                      (profile?.first_name?.charAt(0) || '?')
                    )}
                  </div>
                  <form
                    className="flex-1 min-w-0"
                    onSubmit={handleSubmitInlineComment}
                  >
                    <div className="flex items-end gap-2">
                      <MentionTextarea
                        ref={inlineCommentTextareaDesktopRef}
                        placeholder="Write a comment..."
                        value={inlineComment}
                        onChange={setInlineComment}
                        chapterId={profile?.chapter_id ?? undefined}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmitInlineComment();
                          }
                        }}
                        className="min-h-[40px] max-h-[120px] resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-brand-primary/20"
                        rows={1}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!inlineComment.trim() || isSubmittingComment}
                        className="h-9 w-9 rounded-full p-0 shrink-0 bg-brand-primary text-white hover:bg-brand-primary-hover disabled:opacity-50"
                        aria-label="Send comment"
                      >
                        {isSubmittingComment ? (
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </form>
                </div>
                {(commentsLoading || previewCommentsFromHook.length > 0) && (
                  <div className="min-h-[24px]" onClick={(e) => e.stopPropagation()}>
                    {commentsLoading ? (
                      <div className="flex items-center gap-2 py-2">
                        <div className="h-4 w-4 border-2 border-gray-300 border-t-brand-primary rounded-full animate-spin" />
                        <span className="text-xs text-gray-500">Loading comments...</span>
                      </div>
                    ) : (
                      renderCommentsPreviewList(previewCommentsFromHook)
                    )}
                  </div>
                )}
                {liveCommentCount > previewCommentsFromHook.length && (
                  <button
                    type="button"
                    className="text-left text-xs font-medium text-brand-primary hover:text-brand-primary-hover pt-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCommentComposer(false);
                      openPostView();
                    }}
                  >
                    View all {liveCommentCount} comment{liveCommentCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            )}
          </div>
            </div>

            {/* Desktop like heart overlay */}
            {showHeartOverlay && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                aria-hidden
              >
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.2, 1.2], opacity: [0, 1, 0] }}
                  transition={{
                    duration: 0.8,
                    times: [0, 0.25, 1],
                  }}
                  onAnimationComplete={() => setShowHeartOverlay(false)}
                  className="flex items-center justify-center"
                >
                  <Heart className="h-24 w-24 fill-rose-500 text-rose-500 drop-shadow-lg" />
                </motion.div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 9a: Image Lightbox — only mounted when an image is clicked */}
      {isImageModalOpen && (
        <ImageLightbox
          imageUrls={resolvedImageUrls}
          selectedIndex={selectedImageIndex}
          onClose={handleCloseLightbox}
          onPrev={handlePrevImage}
          onNext={handleNextImage}
        />
      )}

      {/* 9a: Delete Modal — lazy-loaded, mounted only when opened */}
      {isDeleteModalOpen && (
        <LazyDeletePostModal
          isOpen={isDeleteModalOpen}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          post={post}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

/* -----------------------------------------------------------------------
 * 9b: React.memo with custom comparator.
 *     The virtualised SocialFeed passes new function references on every
 *     render (onToggleExpand is inline). The custom comparator skips
 *     callback comparison and only re-renders when visual data changes.
 * --------------------------------------------------------------------- */
function arePostCardPropsEqual(
  prev: PostCardProps,
  next: PostCardProps,
): boolean {
  // Fast path — same object references
  if (
    prev.post === next.post &&
    prev.isExpanded === next.isExpanded &&
    prev.variant === next.variant &&
    prev.showDivider === next.showDivider
  ) {
    return true;
  }

  if (prev.isExpanded !== next.isExpanded) return false;
  if (prev.variant !== next.variant) return false;
  if (prev.showDivider !== next.showDivider) return false;

  // Compare the post fields that drive visual output
  const p = prev.post;
  const n = next.post;
  return (
    p.id === n.id &&
    p.content === n.content &&
    p.post_type === n.post_type &&
    p.likes_count === n.likes_count &&
    p.is_liked === n.is_liked &&
    p.comments_count === n.comments_count &&
    p.is_author === n.is_author &&
    p.image_url === n.image_url &&
    p.created_at === n.created_at &&
    p.comments_preview === n.comments_preview &&
    p.metadata === n.metadata &&
    p.author === n.author
  );
}

export const PostCard = memo(PostCardInner, arePostCardPropsEqual);
