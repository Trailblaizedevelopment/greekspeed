'use client';

import { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { useVisualViewportHeight } from '@/lib/hooks/useVisualViewportHeight';
import { X } from 'lucide-react';

interface ConnectionRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message?: string) => Promise<void>;
  recipientName?: string;
  isLoading?: boolean;
  /** @deprecated No longer used; drawer always uses elevated z-index so it appears above any modal. */
  elevatedForNestedModal?: boolean;
}

export function ConnectionRequestDialog({
  isOpen,
  onClose,
  onSend,
  recipientName,
  isLoading = false,
  elevatedForNestedModal = false,
}: ConnectionRequestDialogProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const isMobile = useIsMobile();

  // Keyboard-aware sizing for iOS Safari when textarea is focused
  const { height: visualHeight, offsetTop } = useVisualViewportHeight();
  const [innerHeight, setInnerHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 768
  );
  useEffect(() => {
    setInnerHeight(window.innerHeight);
  }, []);
  const keyboardLikelyOpen = isMobile && visualHeight < innerHeight - 50;
  const maxHeightPx = keyboardLikelyOpen 
    ? Math.max(visualHeight - 12, 260)
    : undefined;
  const bottomPx =
    keyboardLikelyOpen ? innerHeight - (offsetTop + visualHeight) : undefined;

  const handleSend = async () => {
    setIsSending(true);
    try {
      const trimmedMessage = message.trim() || undefined;
      await onSend(trimmedMessage);
      setMessage('');
      onClose();
    } catch (error) {
      console.error('Failed to send connection request:', error);
      // Keep dialog open on error so user can retry
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (!isSending) {
      setMessage('');
      onClose();
    }
  };

  // Shared message input content
  const messageInput = (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="message" className="text-sm font-medium">
          Message
        </Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hi! I'd love to connect and learn more about your experience..."
          className="min-h-[80px] sm:min-h-[100px] resize-y max-sm:resize-none"
          maxLength={200}
          disabled={isSending}
        />
        <p className="text-xs text-gray-500">
          {message.length}/200 characters
        </p>
      </div>
    </div>
  );

  // Shared buttons
  const buttons = (
    <div className={`flex gap-3 ${isMobile ? 'flex-row' : 'flex-row justify-end'}`}>
      <Button
        variant="outline"
        onClick={handleClose}
        disabled={isSending}
        className={`${isMobile ? 'flex-1' : ''} bg-white/80 hover:bg-white/60 text-gray-700 rounded-full`}
      >
        Cancel
      </Button>
      <Button
        onClick={handleSend}
        disabled={isSending}
        className={`${isMobile ? 'flex-1' : ''} bg-brand-primary hover:bg-brand-primary-hover text-white rounded-full`}
      >
        {isSending ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b border-white mr-2" />
            Sending...
          </>
        ) : (
          'Send Request'
        )}
      </Button>
    </div>
  );

  // Always use elevated z-index so drawer appears above any modal (AlumniProfileModal z-[10001], UserProfileModal z-[10000], etc.)
  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      direction="bottom"
      modal={true}
      dismissible={true}
      fixed={isMobile}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          className="fixed inset-0 z-[10002] bg-black/40 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
        {/* 500px centered via left + margin (no transform) so vaul's translateY animation doesn't conflict or jump. */}
        <Drawer.Content
          className="
            bg-white flex flex-col min-h-0 rounded-t-[10px] z-[10003]
            fixed bottom-0 left-0 right-0
            sm:left-1/2 sm:right-auto sm:w-[500px] sm:-ml-[250px]
            max-h-[70vh] min-h-[40vh]
            shadow-2xl border border-gray-200
            outline-none p-0
          "
          style={
            keyboardLikelyOpen && (maxHeightPx !== undefined || bottomPx !== undefined)
              ? {
                  ...(maxHeightPx !== undefined && {
                    maxHeight: `${maxHeightPx}px`,
                  }),
                  ...(bottomPx !== undefined && { bottom: `${bottomPx}px` }),
                  transition: 'max-height 0.15s ease-out, bottom 0.15s ease-out',
                }
              : undefined
          }
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-4" />

          {/* Header */}
          <div className="flex-shrink-0 border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">
                  Send Connection Request
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {recipientName
                    ? `Introduce yourself to ${recipientName} (optional)`
                    : 'Introduce yourself (optional)'}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="ml-4 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                disabled={isSending}
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Scrollable content - only the message input */}
          <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
            {messageInput}
          </div>

          {/* Buttons - fixed footer, always visible */}
          <div className="flex-shrink-0 border-t border-gray-200 px-4 py-4 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
            {buttons}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}