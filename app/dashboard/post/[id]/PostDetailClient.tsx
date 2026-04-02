'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CommentModal } from '@/components/features/social/CommentModal';
import type { Post } from '@/types/posts';

interface PostDetailClientProps {
  post: Post;
  onLike: (postId: string) => void;
  onCommentAdded?: () => void;
  onBack: () => void;
  onDelete?: (postId: string) => void;
  onEdit?: (postId: string) => void;
  onReport?: (postId: string) => void;
  onBookmark?: (postId: string) => void;
}

/**
 * Post-detail view: sticky header (back + title) and embedded post + comments
 * (Threads-style). Reuses CommentModal in embedded mode for a single shared UX.
 */
export function PostDetailClient({
  post,
  onLike,
  onCommentAdded,
  onBack,
  onDelete,
  onEdit,
  onReport,
  onBookmark,
}: PostDetailClientProps) {
  const relativeTime = post.created_at
    ? (() => { try { return formatDistanceToNow(new Date(post.created_at), { addSuffix: true }); } catch { return ''; } })()
    : '';
  const headerTitle = `Post · ${post.author?.full_name ?? 'Unknown'} · ${relativeTime}`.trim();

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <header data-post-detail-header className="relative z-20 flex-shrink-0 border-b border-slate-200/80 bg-white px-4 py-1.5 sm:px-6 sm:py-4 md:bg-white/95">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-9 w-9 p-0 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 shrink-0"
            aria-label="Back to feed"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-medium text-slate-600 text-base sm:text-lg truncate min-w-0">
            {headerTitle}
          </h1>
        </div>
      </header>

      {/* Scrollable post + comments (CommentModal embedded, no dialog) */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <CommentModal
          isOpen={true}
          onClose={onBack}
          post={post}
          onLike={onLike}
          onCommentAdded={onCommentAdded}
          onDelete={onDelete}
          onEdit={onEdit}
          onReport={onReport}
          onBookmark={onBookmark}
          embedded
        />
      </div>
    </div>
  );
}
