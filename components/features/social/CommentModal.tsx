'use client';

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { X, Heart, MessageCircle, Trash2, Send, ChevronLeft, ChevronRight, Reply, ChevronDown, ChevronUp } from 'lucide-react';
import { PostActionsMenu } from './PostActionsMenu';
import { Post, PostComment } from '@/types/posts';
import { useComments } from '@/lib/hooks/useComments';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useProfileModal } from '@/lib/contexts/ProfileModalContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { formatDistanceToNow } from 'date-fns';
import { ClickableAvatar } from '@/components/features/user-profile/ClickableAvatar';
import { ClickableUserName } from '@/components/features/user-profile/ClickableUserName';
import { LinkPreviewCard } from './LinkPreviewCard';
import { PostImageGrid } from './PostImageGrid';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'react-toastify';
import { ExpandableCommentText } from './ExpandableCommentText';

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post;
  onLike: (postId: string) => void;
  onCommentAdded?: () => void;
  onDelete?: (postId: string) => void;
  onEdit?: (postId: string) => void;
  onReport?: (postId: string) => void;
  onBookmark?: (postId: string) => void;
  /** When provided (e.g. from PostCard), avoids refetching images already loaded for the card. */
  initialImageUrls?: string[];
  /** When true, render content without Dialog (for post-detail page). Comments always enabled. */
  embedded?: boolean;
}

export function CommentModal({ isOpen, onClose, post, onLike, onCommentAdded, onDelete, onEdit, onReport, onBookmark, initialImageUrls, embedded = false }: CommentModalProps) {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [isSubmittingReply, setIsSubmittingReply] = useState<Record<string, boolean>>({});
  // Track which comments have their replies collapsed (hidden) or expanded (showing all)
  const [collapsedReplies, setCollapsedReplies] = useState<Set<string>>(new Set());
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  
  // Mobile detection: sm breakpoint for modal UX, 768 for embedded fixed layout (match ChatWindow)
  const [isMobile, setIsMobile] = useState(false);
  const [isEmbeddedMobile, setIsEmbeddedMobile] = useState(false);

  // Embedded + mobile: fixed regions (header, scroll, input) with measured heights, like ChatWindow
  const useFixedRegions = embedded && isEmbeddedMobile;
  const [appHeaderHeight, setAppHeaderHeight] = useState(56);
  const [postHeaderHeight, setPostHeaderHeight] = useState(52);
  const [bottomNavHeight, setBottomNavHeight] = useState(80);
  const [inputBarHeight, setInputBarHeight] = useState(72);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
      setIsEmbeddedMobile(window.innerWidth < 768); // md: match ChatWindow for embedded layout
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const scrollAreaTop = useFixedRegions ? appHeaderHeight + postHeaderHeight : undefined;
  const scrollAreaBottom = useFixedRegions ? bottomNavHeight + inputBarHeight : undefined;
  const inputBarBottom = useFixedRegions ? bottomNavHeight : undefined;

  // Non-fixed input bar padding (when not using fixed regions)
  const inputStickyNoPadding = embedded && isMobile && !useFixedRegions;
  
  const {
    comments,
    loading,
    error,
    createComment,
    createReply,
    deleteComment,
    likeComment,
    refresh,
    lastFetchedAt,
    loadedFromCache,
    buildCommentTree,
  } = useComments(post.id, {
    enabled: isOpen || embedded,
    initialComments: post.comments_preview,
    initialTotal: post.comments_count,
  });
  const { profile } = useProfile();
  const { isProfileModalOpen } = useProfileModal();
  const { getAuthHeaders } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commentsScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const commentInputBarRef = useRef<HTMLDivElement>(null);
  const MAX_COMMENT_INPUT_HEIGHT = 200;

  // Measure heights for embedded mobile fixed layout (same pattern as ChatWindow)
  useLayoutEffect(() => {
    if (!embedded || !isEmbeddedMobile) return;

    const measure = () => {
      const appHeader =
        document.querySelector('header') ||
        document.querySelector('[data-app-header]') ||
        document.querySelector('.sticky.top-0');
      setAppHeaderHeight(appHeader?.getBoundingClientRect().height ?? 56);

      const postHeader = document.querySelector('[data-post-detail-header]');
      setPostHeaderHeight(postHeader?.getBoundingClientRect().height ?? 52);

      const bottomNav = document.querySelector('[class*="fixed"][class*="bottom-0"]');
      setBottomNavHeight(bottomNav?.getBoundingClientRect().height ?? 80);

      if (commentInputBarRef.current) {
        setInputBarHeight(commentInputBarRef.current.getBoundingClientRect().height);
      }
    };

    measure();
    window.addEventListener('resize', measure);
    const t = setTimeout(measure, 100);
    return () => {
      window.removeEventListener('resize', measure);
      clearTimeout(t);
    };
  }, [embedded, isEmbeddedMobile, comments.length]);
  const MAX_REPLY_INPUT_HEIGHT = 120;
  const MIN_COMMENT_INPUT_HEIGHT = 48;
  const MIN_REPLY_INPUT_HEIGHT = 40;

  const resizeTextarea = useCallback((
    el: HTMLTextAreaElement | null,
    maxHeight: number,
    minHeight: number = 40
  ) => {
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
    el.style.height = `${newHeight}px`;
    el.style.overflowY = newHeight >= maxHeight ? 'auto' : 'hidden';
  }, []);
  
  // Build comment tree from flat array
  const commentTree = useMemo(() => {
    return buildCommentTree(comments);
  }, [comments, buildCommentTree]);
  const lastUpdatedLabel =
    typeof lastFetchedAt === 'number' ? formatRelativeMoment(lastFetchedAt) : null;

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [loadedImageUrls, setLoadedImageUrls] = useState<string[] | null>(null);

  // Get images from post payload (may be empty when feed uses slim shape)
  const imageUrls = useMemo<string[]>(() => {
    return post.metadata?.image_urls || (post.image_url ? [post.image_url] : []);
  }, [post.metadata?.image_urls, post.image_url]);

  // Resolved URLs: prefer initialImageUrls from parent (e.g. PostCard), then on-demand loaded, then from post
  const resolvedImageUrls = useMemo<string[]>(() => {
    if (initialImageUrls?.length) return initialImageUrls;
    if (post.has_image && loadedImageUrls !== null) return loadedImageUrls;
    return imageUrls;
  }, [initialImageUrls, post.has_image, loadedImageUrls, imageUrls]);

  // On-demand image load when modal opens (or when embedded) with slim-feed post (has_image but no URLs)
  useEffect(() => {
    if (!isOpen && !embedded) {
      setLoadedImageUrls(null);
      return;
    }
    if (imageUrls.length > 0 || (initialImageUrls?.length ?? 0) > 0) return;
    if (!post.has_image) return;

    let cancelled = false;
    (async () => {
      try {
        const headers = getAuthHeaders();
        const res = await fetch(`/api/posts/${post.id}/image`, { headers });
        if (!res.ok || cancelled) return;
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
      setLoadedImageUrls(null);
    };
  }, [isOpen, embedded, post.id, post.has_image, imageUrls.length, initialImageUrls?.length, getAuthHeaders]);

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-focus comment input when on post detail page (embedded) or when comment modal opens
  useEffect(() => {
    if (!isOpen && !embedded) return;
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen, embedded]);

  // Handle keyboard navigation in image modal
  useEffect(() => {
    if (!isImageModalOpen || resolvedImageUrls.length <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : resolvedImageUrls.length - 1));
      } else if (e.key === 'ArrowRight') {
        setSelectedImageIndex((prev) => (prev < resolvedImageUrls.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'Escape') {
        setIsImageModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImageModalOpen, resolvedImageUrls.length]);

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setIsImageModalOpen(true);
  };

  const handleNextImage = () => {
    setSelectedImageIndex((prev) => (prev < resolvedImageUrls.length - 1 ? prev + 1 : 0));
  };

  const handlePrevImage = () => {
    setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : resolvedImageUrls.length - 1));
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createComment({ 
        content: newComment.trim()
      });
      setNewComment('');
      // Focus back on textarea for quick commenting
      textareaRef.current?.focus();
      // Notify parent component that a comment was added
      onCommentAdded?.();
    } catch (error) {
      console.error('Failed to create comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentCommentId: string) => {
    const content = replyContent[parentCommentId];
    if (!content?.trim() || isSubmittingReply[parentCommentId]) return;

    setIsSubmittingReply(prev => ({ ...prev, [parentCommentId]: true }));
    try {
      await createReply(parentCommentId, { 
        content: content.trim()
      });
      setReplyContent(prev => {
        const updated = { ...prev };
        delete updated[parentCommentId];
        return updated;
      });
      setReplyingToCommentId(null);
      onCommentAdded?.();
    } catch (error) {
      console.error('Failed to create reply:', error);
    } finally {
      setIsSubmittingReply(prev => ({ ...prev, [parentCommentId]: false }));
    }
  };

  const handleCancelReply = (commentId: string) => {
    setReplyingToCommentId(null);
    setReplyContent(prev => {
      const updated = { ...prev };
      delete updated[commentId];
      return updated;
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  const handleCommentActionClick = useCallback(() => {
    const input = textareaRef.current;
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, []);

  const handleCommentInputFocus = useCallback(() => {
    if (!embedded || !isMobile) return;
    const scrollEl = scrollContentRef.current;
    const savedScrollTop = scrollEl?.scrollTop ?? 0;
    requestAnimationFrame(() => {
      if (scrollEl) scrollEl.scrollTop = savedScrollTop;
    });
    const t = setTimeout(() => {
      if (scrollContentRef.current) scrollContentRef.current.scrollTop = savedScrollTop;
    }, 50);
    const t2 = setTimeout(() => {
      if (scrollContentRef.current) scrollContentRef.current.scrollTop = savedScrollTop;
    }, 150);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [embedded, isMobile]);

  // Auto-resize main comment textarea when content changes
  useEffect(() => {
    resizeTextarea(textareaRef.current, MAX_COMMENT_INPUT_HEIGHT, MIN_COMMENT_INPUT_HEIGHT);
  }, [newComment, resizeTextarea]);

  // Auto-resize active reply textarea when its content changes
  useEffect(() => {
    if (replyingToCommentId) {
      resizeTextarea(replyTextareaRef.current, MAX_REPLY_INPUT_HEIGHT, MIN_REPLY_INPUT_HEIGHT);
    }
  }, [replyingToCommentId, replyContent, resizeTextarea]);

  const handleDeleteComment = async (commentId: string) => {
    if (confirm('Are you sure you want to delete this comment?')) {
      await deleteComment(commentId);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    try {
      await likeComment(commentId);
    } catch {
      toast.error('Failed to like comment');
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refresh();
    } catch (err) {
      console.error('Failed to refresh comments:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'recently';
    }
  };

  function formatRelativeMoment(timestamp: number | null) {
    if (!timestamp) return null;
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return null;
    }
  }

  // Helper function to count total replies recursively
  const countReplies = (comment: PostComment): number => {
    if (!comment.replies || comment.replies.length === 0) return 0;
    return comment.replies.length + comment.replies.reduce((sum, reply) => sum + countReplies(reply), 0);
  };

  // Toggle reply visibility
  const toggleReplies = (commentId: string) => {
    setCollapsedReplies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        // Uncollapse - show replies
        newSet.delete(commentId);
      } else {
        // Collapse - hide replies
        newSet.add(commentId);
        setExpandedReplies(expanded => {
          const newExpanded = new Set(expanded);
          newExpanded.delete(commentId);
          return newExpanded;
        });
      }
      return newSet;
    });
  };

  // Expand to show all replies
  const expandReplies = (commentId: string) => {
    setExpandedReplies(prev => new Set(prev).add(commentId));
    setCollapsedReplies(prev => {
      const newSet = new Set(prev);
      newSet.delete(commentId);
      return newSet;
    });
  };

  // Render post content with link parsing and preview cards (for modal display)
  const renderPostContentInModal = () => {
    if (!post.content) return null;

    // Get URLs that have previews - we'll hide these from the content
    const previewUrls = new Set(
      (post.metadata?.link_previews || []).map((preview: any) => preview.url),
    );

    // Convert URLs to clickable links, but skip URLs that have previews
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const contentWithLinks = post.content
      .split(urlRegex)
      .map((part, i) => {
        if (part.match(urlRegex)) {
          const cleanUrl = part.replace(/[.,;:!?]+$/, '');
          // If this URL has a preview card, don't render it as a link
          if (previewUrls.has(cleanUrl)) {
            return null; // Hide URLs that have preview cards
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
        return <span key={i}>{part}</span>;
      })
      .filter(Boolean); // Remove null entries

    return (
      <div className="space-y-2">
        <p className="text-slate-800 text-sm sm:text-base leading-relaxed break-words whitespace-pre-wrap">
          {contentWithLinks}
        </p>
        {/* Link Preview Cards */}
        {post.metadata?.link_previews && post.metadata.link_previews.length > 0 && (
          <div className="space-y-2 mt-2">
            {post.metadata.link_previews.map(
              (preview: any, index: number) => (
                <LinkPreviewCard
                  key={preview.url || index}
                  preview={preview}
                  className="max-w-full"
                  hideImage={resolvedImageUrls.length > 0}
                />
              ),
            )}
          </div>
        )}
      </div>
    );
  };

  // Render comment content with link parsing and preview cards
  const renderCommentContent = (comment: PostComment) => {
    if (!comment.content) return null;

    // Get URLs that have previews - we'll hide these from the content
    const previewUrls = new Set(
      (comment.metadata?.link_previews || []).map((preview: any) => preview.url),
    );

    // Convert URLs to clickable links, but skip URLs that have previews
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const contentWithLinks = comment.content
      .split(urlRegex)
      .map((part, i) => {
        if (part.match(urlRegex)) {
          const cleanUrl = part.replace(/[.,;:!?]+$/, '');
          // If this URL has a preview card, don't render it as a link
          if (previewUrls.has(cleanUrl)) {
            return null; // Hide URLs that have preview cards
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
        return <span key={i}>{part}</span>;
      })
      .filter(Boolean); // Remove null entries

    return (
      <div className="space-y-2">
        <p className="text-slate-900 text-sm sm:text-base leading-relaxed break-words whitespace-pre-wrap">
          {contentWithLinks}
        </p>
        {/* Link Preview Cards */}
        {comment.metadata?.link_previews && comment.metadata.link_previews.length > 0 && (
          <div className="space-y-2 mt-2">
            {comment.metadata.link_previews.map(
              (preview: any, index: number) => (
                <LinkPreviewCard
                  key={preview.url || index}
                  preview={preview}
                  className="max-w-full"
                />
              ),
            )}
          </div>
        )}
      </div>
    );
  };

  // Recursive component to render comment with replies
  // MAX_DEPTH = 1 means: POST -> COMMENT (depth 0) -> REPLY (depth 1) -> STOP
  const MAX_DEPTH = 1;
  
  const renderComment = (comment: PostComment, depth: number = 0): React.ReactNode => {
    // Stop rendering if we've exceeded max depth (prevent level 2+ replies from showing)
    if (depth > MAX_DEPTH) {
      return null;
    }
    
    const isReply = depth > 0;
    const isReplying = replyingToCommentId === comment.id;
    const currentReplyContent = replyContent[comment.id] || '';
    const isSubmittingCurrentReply = isSubmittingReply[comment.id] || false;
    const hasReplies = comment.replies && comment.replies.length > 0;
    const replyCount = comment.replies?.length || 0;
    const totalReplyCount = countReplies(comment);
    const isCollapsed = collapsedReplies.has(comment.id);
    const isExpanded = expandedReplies.has(comment.id);
    // Show first 2-3 replies by default, then require expansion
    const defaultVisibleReplies = 2;
    const shouldShowMoreButton = replyCount > defaultVisibleReplies;
    const visibleReplies = isCollapsed 
      ? [] 
      : isExpanded || !shouldShowMoreButton
      ? comment.replies || []
      : (comment.replies || []).slice(0, defaultVisibleReplies);
    const hiddenRepliesCount = (comment.replies || []).length - visibleReplies.length;

    return (
      <div key={comment.id} className={cn(
        "py-3 relative",
        isReply && "ml-8 sm:ml-10 pl-4 sm:pl-5"
      )}>
        {/* Reply indicator line - subtle left border */}
        {isReply && (
          <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
        )}
        
        <div className="flex items-start gap-3 sm:gap-4 relative">
          {comment.author?.id ? (
            <ClickableAvatar
              userId={comment.author.id}
              avatarUrl={comment.author.avatar_url}
              fullName={comment.author.full_name}
              firstName={comment.author.first_name}
              lastName={comment.author.last_name}
              size="sm"
              className="w-9 h-9 sm:w-10 sm:h-10 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 text-sm font-medium shrink-0 overflow-hidden">
              {comment.author?.first_name?.charAt(0) || 'U'}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* No card wrapper - clean layout */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {comment.author?.id && comment.author?.full_name ? (
                <ClickableUserName
                  userId={comment.author.id}
                  fullName={comment.author.full_name}
                  className="font-semibold text-slate-900 text-sm sm:text-base break-words"
                />
              ) : (
                <span className="font-semibold text-slate-900 text-sm sm:text-base break-words">
                  {comment.author?.full_name || 'Unknown User'}
                </span>
              )}
              <span className="text-xs sm:text-sm text-slate-500">
                {formatTimestamp(comment.created_at)}
              </span>
            </div>

            <ExpandableCommentText commentId={comment.id} className="mb-2">
              {renderCommentContent(comment)}
            </ExpandableCommentText>

            {/* Comment Actions - buttons keep existing styles */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleLikeComment(comment.id)}
                className={cn(
                  comment.is_liked
                    ? 'bg-rose-50/80 text-rose-500 border border-transparent hover:bg-rose-100'
                    : 'bg-white/90 text-slate-500 border border-transparent hover:bg-rose-50 hover:text-rose-500',
                  "text-xs sm:text-sm h-8 rounded-full px-4 shadow-sm transition"
                )}
              >
                <motion.span
                  className="inline-flex mr-1 sm:mr-2"
                  initial={false}
                  animate={{ scale: comment.is_liked ? [1, 1.25, 1] : 1 }}
                  transition={{ duration: 0.25 }}
                >
                  <Heart
                    className={cn(
                      "h-3 w-3 sm:h-4 sm:w-4",
                      comment.is_liked ? 'fill-current' : ''
                    )}
                  />
                </motion.span>
                {comment.likes_count || 0}
              </Button>
              
              {/* Reply button - only show for top-level comments (depth 0) */}
              {depth === 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReplyingToCommentId(comment.id);
                    setReplyContent(prev => ({ ...prev, [comment.id]: '' }));
                  }}
                  className="text-xs sm:text-sm h-8 rounded-full px-4 bg-accent-50/80 text-accent-500 border border-transparent hover:bg-accent-100 shadow-sm transition"
                >
                  <Reply className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Reply
                </Button>
              )}

              {/* Reply count badge - show on top-level comments with replies (only when expanded, so we show "Hide X reply" here; when collapsed, "Show X reply" is in the block below) */}
              {depth === 0 && hasReplies && !isCollapsed && (
                <button
                  onClick={() => toggleReplies(comment.id)}
                  className="text-xs text-brand-accent hover:text-accent-700 font-medium flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent-50/50 transition-colors"
                  aria-label={isCollapsed ? `Show ${totalReplyCount} replies` : `Hide replies`}
                >
                  {isCollapsed ? (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show {totalReplyCount} {totalReplyCount === 1 ? 'reply' : 'replies'}
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Hide {totalReplyCount} {totalReplyCount === 1 ? 'reply' : 'replies'}
                    </>
                  )}
                </button>
              )}

              {comment.author_id === profile?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteComment(comment.id)}
                  className="text-xs sm:text-sm h-8 rounded-full px-4 bg-white/90 text-red-500 border border-transparent hover:bg-red-50 shadow-sm transition"
                >
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Delete
                </Button>
              )}
            </div>

            {/* Inline Reply Input - stacked on mobile so input is full width, single row on sm+ */}
            {isReplying && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="mb-2">
                  <p className="text-xs text-brand-accent font-medium">
                    Replying to {comment.author?.full_name || 'this comment'}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                  <div className="flex items-end gap-2 flex-1 min-w-0">
                    <div className="w-8 h-8 bg-primary-100/70 rounded-full flex items-center justify-center text-brand-primary-hover text-xs font-semibold shrink-0 overflow-hidden ring-2 ring-white">
                      {profile?.avatar_url ? (
                        <Image
                          src={profile.avatar_url}
                          alt={profile.full_name || 'User'}
                          width={32}
                          height={32}
                          className="h-full w-full rounded-full object-cover"
                          sizes="32px"
                        />
                      ) : (
                        profile?.first_name?.charAt(0) || 'U'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Textarea
                        ref={replyTextareaRef}
                        placeholder="Write a reply..."
                        value={currentReplyContent}
                        onChange={(e) => setReplyContent(prev => ({ ...prev, [comment.id]: e.target.value }))}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmitReply(comment.id);
                          }
                        }}
                        className="min-h-[40px] max-h-[120px] resize-none overflow-y-hidden rounded-xl border border-transparent bg-white/80 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-200 transition"
                        rows={1}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 sm:shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelReply(comment.id)}
                      className="rounded-full h-8 px-3 text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleSubmitReply(comment.id)}
                      disabled={!currentReplyContent.trim() || isSubmittingCurrentReply}
                      className="h-8 w-8 rounded-full bg-brand-primary text-white shadow-sm transition-all duration-200 hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center p-0"
                    >
                      {isSubmittingCurrentReply ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 text-white" strokeWidth={2} />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Render Replies - clean spacing */}
            {hasReplies && !isCollapsed && (
              <div className="mt-2 space-y-0">
                {visibleReplies.map((reply) => renderComment(reply, depth + 1))}
                
                {/* Show more replies button */}
                {hiddenRepliesCount > 0 && (
                  <button
                    onClick={() => expandReplies(comment.id)}
                    className="text-xs text-brand-accent hover:text-accent-700 font-medium flex items-center gap-1 px-3 py-2 rounded-md hover:bg-accent-50/50 transition-colors ml-8 sm:ml-12"
                    aria-label={`Show ${hiddenRepliesCount} more replies`}
                  >
                    <ChevronDown className="h-3 w-3" />
                    Show {hiddenRepliesCount} more {hiddenRepliesCount === 1 ? 'reply' : 'replies'}
                  </button>
                )}
              </div>
            )}
            
            {/* Collapsed state indicator */}
            {hasReplies && isCollapsed && (
              <div className="mt-2 ml-0">
                <button
                  onClick={() => toggleReplies(comment.id)}
                  className="text-xs text-brand-accent hover:text-accent-700 font-medium flex items-center gap-1 px-3 py-2 rounded-md hover:bg-accent-50/50 transition-colors"
                >
                  <ChevronDown className="h-3 w-3" />
                  Show {totalReplyCount} {totalReplyCount === 1 ? 'reply' : 'replies'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Image Viewer Modal Component (same as PostCard)
  const ImageViewerModal = () => {
    if (!mounted || !isImageModalOpen || resolvedImageUrls.length === 0) return null;

    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div 
          className="absolute inset-0 bg-black/90 backdrop-blur-sm"
          onClick={() => setIsImageModalOpen(false)}
        />
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsImageModalOpen(false)}
          className="absolute top-4 right-4 z-10 h-10 w-10 p-0 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/20"
          aria-label="Close image viewer"
        >
          <X className="h-5 w-5" />
        </Button>

        {resolvedImageUrls.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handlePrevImage();
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
                handleNextImage();
              }}
              className="absolute right-4 z-10 h-12 w-12 p-0 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/20"
              aria-label="Next image"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        <div 
          className="relative max-w-[95vw] max-h-[95vh] w-full h-full flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={resolvedImageUrls[Math.min(selectedImageIndex, resolvedImageUrls.length - 1)]}
            alt={`Post image ${selectedImageIndex + 1} of ${resolvedImageUrls.length}`}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>

        {resolvedImageUrls.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
            {Math.min(selectedImageIndex, resolvedImageUrls.length - 1) + 1} / {resolvedImageUrls.length}
          </div>
        )}
      </div>,
      document.body
    );
  };

  const postAndCommentsContent = (
    <>
        {/* Combined Scrollable Content Area - fixed region on embedded mobile (like ChatWindow) */}
        <div
          ref={scrollContentRef}
          className={cn(
            "flex-1 overflow-y-auto min-h-0 bg-white/70",
            isMobile ? "px-4" : "px-6",
            useFixedRegions && "fixed left-0 right-0 z-10"
          )}
          style={useFixedRegions && scrollAreaTop != null && scrollAreaBottom != null ? {
            top: `${scrollAreaTop}px`,
            bottom: `${scrollAreaBottom}px`,
          } : undefined}
        >
          {/* Original Post */}
          <div className={cn(
            "py-5 border-b border-slate-200/60 bg-white/80",
            useFixedRegions && "pt-16",
            isMobile ? "px-0" : "px-0"
          )}>
            <div className="flex items-start gap-4">
              {post.author?.id ? (
                <ClickableAvatar
                  userId={post.author.id}
                  avatarUrl={post.author.avatar_url}
                  fullName={post.author.full_name}
                  firstName={post.author.first_name}
                  lastName={post.author.last_name}
                  size="md"
                  className="w-12 h-12 sm:w-12 sm:h-12 ring-2 ring-white"
                />
              ) : (
                <div className="w-12 h-12 sm:w-12 sm:h-12 bg-primary-100/70 rounded-full flex items-center justify-center text-brand-primary-hover text-base font-semibold shrink-0 overflow-hidden ring-2 ring-white">
                  {post.author?.first_name?.charAt(0) || 'U'}
                </div>
              )}
              
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3 min-w-0">
                    {isMobile ? (
                      <span className="font-normal text-slate-600 text-base break-words">
                        {post.author?.id ? (
                          <ClickableUserName
                            userId={post.author.id}
                            fullName={[post.author.first_name, post.author.last_name].filter(Boolean).join(' ') || post.author.full_name || 'Unknown User'}
                            className="font-normal text-slate-600 text-base break-words hover:text-slate-800"
                          />
                        ) : (
                          [post.author?.first_name, post.author?.last_name].filter(Boolean).join(' ') || post.author?.full_name || 'Unknown User'
                        )}
                        {' · '}
                        <span className="text-slate-500">{formatTimestamp(post.created_at)}</span>
                      </span>
                    ) : (
                      <>
                        {post.author?.id && post.author?.full_name ? (
                          <ClickableUserName
                            userId={post.author.id}
                            fullName={post.author.full_name}
                            className="font-medium text-slate-900 text-base break-words"
                          />
                        ) : (
                          <h4 className="font-medium text-slate-900 text-base break-words">
                            {post.author?.full_name || 'Unknown User'}
                          </h4>
                        )}
                        <p className="text-sm text-slate-500">
                          {formatTimestamp(post.created_at)}
                        </p>
                      </>
                    )}
                  </div>
                  <PostActionsMenu
                    post={post}
                    isAuthor={!!post.is_author}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onReport={onReport}
                    onBookmark={onBookmark}
                    useDeleteModal={false}
                    isBookmarked={!!post.is_bookmarked}
                  />
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  {post.author?.member_status && (
                    <span className="text-xs sm:text-sm text-slate-500 break-words">
                      {post.author.member_status === 'active' ? 'member' : post.author.member_status}
                    </span>
                  )}
                </div>
                
                {/* Post Content with link previews */}
                {post.content && renderPostContentInModal()}
                
                {/* Post images: same multi-image grid as feed (2/3/4+ layout) */}
                {resolvedImageUrls.length > 0 && (
                  <div className={cn("mt-3", embedded && "max-w-[450px]")}>
                    <PostImageGrid
                      imageUrls={resolvedImageUrls}
                      onImageClick={handleImageClick}
                      multiImageSizes="(max-width: 640px) 50vw, 350px"
                    />
                  </div>
                )}

                {/* Post Actions */}
                <div className="flex flex-wrap items-center gap-3">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => onLike(post.id)}
                    className={`${
                      post.is_liked 
                        ? 'bg-rose-50/80 text-rose-500 border border-transparent hover:bg-rose-100'
                        : 'bg-white/90 text-slate-500 border border-transparent hover:bg-rose-50 hover:text-rose-500'
                    } h-9 rounded-full px-4 shadow-sm transition`}
                  >
                    <motion.span
                      className="inline-flex mr-1 sm:mr-2"
                      initial={false}
                      animate={{ scale: post.is_liked ? [1, 1.25, 1] : 1 }}
                      transition={{ duration: 0.25 }}
                    >
                      <Heart className={`h-4 w-4 sm:h-5 sm:w-5 ${post.is_liked ? 'fill-current' : ''}`} />
                    </motion.span>
                    <span className="text-xs sm:text-sm">{post.likes_count}</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleCommentActionClick}
                    className="h-9 rounded-full px-4 bg-accent-50/80 text-accent-500 border border-transparent hover:bg-accent-100 shadow-sm transition"
                  >
                    <MessageCircle className={`h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2`} />
                    <span className="text-xs sm:text-sm">{post.comments_count}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Comments Section */}
          {loading ? (
            <div className="px-6 py-12 text-center bg-white/60">
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-10 h-10 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-500 text-sm sm:text-base font-medium">Loading comments...</p>
              </div>
            </div>
          ) : error ? (
            <div className="px-6 py-8 text-center bg-white/60">
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-2">
                  <X className="w-5 h-5 text-red-600" />
                </div>
                <p className="text-red-500 text-sm sm:text-base font-medium">Error loading comments</p>
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            </div>
          ) : comments.length === 0 ? (
            <div className="px-6 py-10 text-center bg-white/60">
              <MessageCircle className="h-14 w-14 sm:h-16 sm:w-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-sm sm:text-base mb-1 font-medium">No comments yet</p>
              <p className="text-xs sm:text-sm text-slate-400">Be the first to comment!</p>
            </div>
          ) : (
            <div
              ref={commentsScrollRef}
              className={cn(
                "overflow-y-auto px-4 sm:px-6 py-4 bg-white/60",
                !embedded && (isMobile ? "max-h-[calc(85dvh-200px)]" : "max-h-[55vh]")
              )}
            >
              <div className="space-y-0">
                {commentTree.length === 0 ? (
                  <div className="px-6 py-10 text-center bg-white/60">
                    <MessageCircle className="h-14 w-14 sm:h-16 sm:w-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 text-sm sm:text-base mb-1 font-medium">No comments yet</p>
                    <p className="text-xs sm:text-sm text-slate-400">Be the first to comment!</p>
                  </div>
                ) : (
                  commentTree.map((comment) => renderComment(comment, 0))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Comment Input - fixed above bottom nav on embedded mobile (like ChatWindow) */}
        {useFixedRegions ? (
          <div style={{ height: inputBarHeight, flexShrink: 0 }} aria-hidden="true" />
        ) : null}
        <div
          ref={commentInputBarRef}
          className={cn(
            "flex-shrink-0 border-t border-slate-200/70 bg-slate-50/70 shadow-inner",
            !useFixedRegions && (isMobile
              ? inputStickyNoPadding
                ? "px-4 py-3"
                : "px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]"
              : "px-6 py-4")
          )}
          style={useFixedRegions && inputBarBottom != null ? {
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: `${inputBarBottom}px`,
            zIndex: 50,
            padding: '12px 16px',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
            background: 'rgb(248 250 252 / 0.95)',
            borderTop: '1px solid rgb(226 232 240 / 0.7)',
            boxShadow: '0 -4px 6px -1px rgb(0 0 0 / 0.05)',
          } : undefined}
        >
          <div className="flex items-end gap-4">
            <div className="w-10 h-10 sm:w-10 sm:h-10 bg-primary-100/70 rounded-full flex items-center justify-center text-brand-primary-hover text-sm font-semibold shrink-0 overflow-hidden ring-2 ring-white">
              {profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.full_name || 'User'}
                  width={40}
                  height={40}
                  className="h-full w-full rounded-full object-cover"
                  sizes="40px"
                />
              ) : (
                profile?.first_name?.charAt(0) || 'U'
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <Textarea
                ref={textareaRef}
                placeholder="Write a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={handleCommentInputFocus}
                className="min-h-[48px] sm:min-h-[52px] max-h-[200px] resize-none overflow-y-hidden rounded-2xl border border-transparent bg-white/80 px-4 py-3 text-sm sm:text-base text-slate-800 placeholder:text-slate-400 focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-200 transition"
                rows={1}
              />
            </div>
            
            <Button
              onClick={handleSubmitComment}
              disabled={!newComment.trim() || isSubmitting}
              className="h-12 w-12 sm:h-12 sm:w-12 rounded-full bg-brand-primary text-white shadow-[0_18px_45px_-24px_rgba(30,64,175,0.9)] transition-all duration-200 hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-4 w-4 sm:h-5 sm:w-5" />
              )}
            </Button>
          </div>
        </div>
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {postAndCommentsContent}
        <ImageViewerModal />
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={!isProfileModalOpen}>
      <DialogContent
        className={cn(
          isMobile
            ? "fixed left-0 right-0 bottom-0 top-auto z-50 w-full max-h-[85dvh] mt-[15dvh] rounded-t-2xl rounded-b-none flex flex-col overflow-hidden border border-slate-200/80 bg-white/95 backdrop-blur-md shadow-[0_28px_90px_-40px_rgba(15,23,42,0.55)] p-0 translate-x-0 translate-y-0 pb-[env(safe-area-inset-bottom)]"
            : "sm:max-w-[720px] max-w-[95vw] h-[100dvh] sm:h-[85vh] flex flex-col overflow-hidden border border-slate-200/80 bg-white/95 backdrop-blur-md shadow-[0_28px_90px_-40px_rgba(15,23,42,0.55)] sm:rounded-3xl rounded-2xl p-0 fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
          "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        )}
        onPointerDownOutside={(e) => {
          if (isProfileModalOpen) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (isProfileModalOpen) e.preventDefault();
        }}
      >
        <DialogHeader className={cn(
          "flex-shrink-0 border-b border-slate-200/70",
          isMobile ? "px-4 py-3" : "px-6 py-4"
        )}>
          <div className="flex items-center justify-between">
            <DialogTitle className={cn(
              "font-semibold tracking-tight text-slate-900",
              isMobile ? "text-lg" : "text-xl"
            )}>
              Comments
            </DialogTitle>
          </div>
        </DialogHeader>
        {postAndCommentsContent}
      </DialogContent>
      <ImageViewerModal />
    </Dialog>
  );
}
