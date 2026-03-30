'use client';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { Post } from '@/types/posts';

interface DeletePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  post: Post | null;
  isDeleting: boolean;
}

export function DeletePostModal({ isOpen, onClose, onConfirm, post, isDeleting }: DeletePostModalProps) {
  if (!post) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] max-w-[95vw] p-4 sm:p-6 rounded-2xl shadow-lg bg-white border border-gray-200">
        <DialogHeader className="pb-1 sm:pb-1 pt-1 sm:pt-1">
          <DialogTitle className="flex items-center space-x-3 sm:space-x-2 text-xl sm:text-lg">
            <span>Delete Post</span>
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 sm:py-2">
          <div className="flex items-start space-x-4 sm:space-x-3 mb-5 sm:mb-3">
            <div className="w-12 h-12 sm:w-8 sm:h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 shrink-0">
              <Trash2 className="h-6 w-6 sm:h-4 sm:w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-gray-900 mb-2 sm:mb-1 text-lg sm:text-base">
                Are you sure you want to delete this post?
              </h3>
              <p className="text-base sm:text-sm text-gray-600 mb-4 sm:mb-3 leading-relaxed">
                This action cannot be undone. The post and all its comments will be permanently removed.
              </p>
              {/* Preview of the post content */}
              <div className="bg-gray-50 rounded-xl p-4 sm:p-3 border border-gray-200">
                <p className="text-base sm:text-sm text-gray-700 line-clamp-3 break-words">
                  {post.content}
                </p>
                {post.image_url && (
                  <div className="mt-3 sm:mt-2 text-sm sm:text-xs text-gray-500">
                    Post contains an image
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-3 pt-4 sm:gap-0 sm:space-x-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isDeleting}
              className="min-w-0 border-gray-300 text-gray-700 hover:bg-gray-50 h-12 sm:h-10 w-full sm:w-auto sm:flex-initial rounded-full font-medium transition"
            >
              <span className="text-base sm:text-sm">Cancel</span>
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isDeleting}
              className="min-w-0 bg-red-600 hover:bg-red-700 text-white h-12 sm:h-10 w-full sm:w-auto sm:flex-initial rounded-full font-medium transition"
            >
              {isDeleting ? (
                <div className="flex min-w-0 items-center justify-center gap-2">
                  <div className="h-5 w-5 shrink-0 border-2 border-white border-t-transparent rounded-full animate-spin sm:h-4 sm:w-4" />
                  <span className="text-base sm:text-sm">Deleting...</span>
                </div>
              ) : (
                <div className="flex min-w-0 items-center justify-center gap-2">
                  <Trash2 className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
                  <span className="text-base sm:text-sm">Delete Post</span>
                </div>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
