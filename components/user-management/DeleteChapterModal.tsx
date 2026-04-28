'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface Chapter {
  id: string;
  name: string;
  university: string;
  national_fraternity: string;
  member_count: number;
}

interface DeleteChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  chapter: Chapter | null;
  isDeleting: boolean;
}

export function DeleteChapterModal({ isOpen, onClose, onConfirm, chapter, isDeleting }: DeleteChapterModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!mounted || !isOpen || !chapter) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100150] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card
        className="relative z-[100160] flex max-h-[min(90vh,560px)] w-full max-w-md flex-col overflow-hidden shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="shrink-0 space-y-0 border-b border-gray-200 px-5 py-3 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold leading-tight text-red-600">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Delete space
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 shrink-0 p-0 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          <div className="space-y-3 text-center">
            <p className="text-sm leading-snug text-gray-700">
              Are you sure you want to delete this space? This action cannot be undone.
            </p>

            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-left">
              <h4 className="mb-2 font-semibold text-red-800">{chapter.name}</h4>
              <div className="space-y-1 text-sm text-red-700">
                <p>
                  <strong>University:</strong> {chapter.university}
                </p>
                <p>
                  <strong>National / category:</strong> {chapter.national_fraternity}
                </p>
                <p>
                  <strong>Members:</strong> {chapter.member_count}
                </p>
              </div>
            </div>

            <p className="text-sm font-medium text-red-600">
              This will permanently remove the space and all associated data.
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-gray-50/90 px-5 py-3">
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex items-center gap-2 rounded-full"
            >
              {isDeleting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                  <span>Deleting…</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  <span>Delete space</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>,
    document.body
  );
}
