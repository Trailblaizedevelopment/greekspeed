'use client';

import { useCallback } from 'react';
import { MoreVertical, Pencil, Flag, Trash2, Share2, Bookmark, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Post } from '@/types/posts';
import { toast } from 'react-toastify';

export interface PostActionsMenuProps {
  post: Post;
  isAuthor: boolean;
  onEdit?: (postId: string) => void;
  onDelete?: (postId: string) => void;
  onReport?: (postId: string) => void;
  /** Block post author (non-author posts only; parent shows confirm + calls API). */
  onBlockAuthor?: (post: Post) => void;
  onCopyLink?: (postId: string) => void;
  onBookmark?: (postId: string) => void;
  onDeleteClick?: () => void;
  /** When true, clicking Delete opens parent's delete modal instead of calling onDelete directly */
  useDeleteModal?: boolean;
  isBookmarked?: boolean;
  className?: string;
}

function getPostUrl(postId: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/dashboard/post/${postId}`;
}

export function PostActionsMenu({
  post,
  isAuthor,
  onEdit,
  onDelete,
  onReport,
  onBlockAuthor,
  onCopyLink,
  onBookmark,
  onDeleteClick,
  useDeleteModal = false,
  isBookmarked = false,
  className = '',
}: PostActionsMenuProps) {
  const handleCopyLink = useCallback(() => {
    const url = getPostUrl(post.id);
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Link copied to clipboard'))
      .catch(() => toast.error('Failed to copy link'));
    onCopyLink?.(post.id);
  }, [post.id, onCopyLink]);

  const handleShare = useCallback(() => {
    handleCopyLink();
  }, [handleCopyLink]);

  const handleBookmark = useCallback(() => {
    onBookmark?.(post.id);
  }, [post.id, onBookmark]);

  const handleEdit = useCallback(() => {
    onEdit?.(post.id);
  }, [post.id, onEdit]);

  const handleReport = useCallback(() => {
    onReport?.(post.id);
  }, [post.id, onReport]);

  const handleBlockAuthor = useCallback(() => {
    onBlockAuthor?.(post);
  }, [post, onBlockAuthor]);

  const handleDelete = useCallback(() => {
    if (useDeleteModal && onDeleteClick) {
      onDeleteClick();
    } else if (onDelete) {
      onDelete(post.id);
    }
  }, [post.id, useDeleteModal, onDeleteClick, onDelete]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => e.stopPropagation()}
          className={`rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${className}`}
          title="More actions"
          aria-label="Post actions menu"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {isAuthor && onEdit && (
          <DropdownMenuItem onClick={handleEdit} className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        {!isAuthor && onReport && (
          <DropdownMenuItem onClick={handleReport} className="gap-2">
            <Flag className="h-4 w-4" />
            Report
          </DropdownMenuItem>
        )}
        {!isAuthor && post.author_id && onBlockAuthor && (
          <DropdownMenuItem
            onClick={handleBlockAuthor}
            className="gap-2 text-gray-900 focus:bg-gray-50"
          >
            <UserX className="h-4 w-4" />
            Block user
          </DropdownMenuItem>
        )}
        {/*
        <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
          <Link2 className="h-4 w-4" />
          Copy link
        </DropdownMenuItem>
        */}
        {(isAuthor ? (useDeleteModal ? onDeleteClick : onDelete) : false) && (
          <DropdownMenuItem
            onClick={handleDelete}
            className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleShare} className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleBookmark} className="gap-2">
          <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
          {isBookmarked ? 'Saved' : 'Bookmark'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
