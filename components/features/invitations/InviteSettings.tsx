'use client';

import { useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { X, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface InviteSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteSettings({ open, onOpenChange }: InviteSettingsProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const drawerContent = (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-start justify-between gap-3 px-4 pt-2 sm:pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex-1 min-w-0 text-left space-y-1">
          <Drawer.Title className="text-lg font-semibold text-gray-900">
            Invitation Settings & Statistics
          </Drawer.Title>
          <Drawer.Description className="text-sm font-normal text-gray-500">
            How invitations work and security practices for your chapter.
          </Drawer.Description>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div
        className={cn(
          'flex-1 min-h-0 overflow-y-auto px-4 py-5',
          isMobile ? 'max-h-[50dvh]' : 'max-h-[min(50vh,420px)]'
        )}
      >
        <section>
          <div className="flex items-center space-x-2 mb-2">
            <Info className="h-4 w-4 text-brand-accent shrink-0" />
            <span className="text-base font-semibold">How Invitations Work</span>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <h4 className="font-medium text-sm">Single-Use Per Email</h4>
              <p className="text-xs sm:text-sm text-gray-600">
                Each email address can only use each invitation link once. This prevents duplicate signups while
                allowing multiple people to use the same invitation with different emails.
              </p>
            </div>
            <div className="space-y-1">
              <h4 className="font-medium text-sm">Auto-Approval</h4>
              <p className="text-xs sm:text-sm text-gray-600">
                All invitations use auto-approval. New members gain immediate access after signup.
              </p>
            </div>
            <div className="space-y-1">
              <h4 className="font-medium text-sm">Open Email Access</h4>
              <p className="text-xs sm:text-sm text-gray-600">
                All invitations accept any email address from any domain. This allows maximum flexibility for chapter
                members to join using their preferred email address.
              </p>
            </div>
          </div>
        </section>

        <div className="my-6 border-t border-gray-200" />

        <section>
          <div className="flex items-center space-x-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
            <span className="text-base font-semibold">Security Best Practices</span>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <h4 className="font-medium text-sm">Invitation Security</h4>
              <ul className="text-xs sm:text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Each invitation generates a unique, secure token</li>
                <li>Invitations can be deactivated at any time</li>
                <li>Usage is tracked to prevent abuse</li>
                <li>Expiration dates help limit exposure</li>
              </ul>
            </div>
            <div className="space-y-1">
              <h4 className="font-medium text-sm">Recommendations</h4>
              <ul className="text-xs sm:text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Set reasonable expiration dates for invitations</li>
                <li>Monitor invitation usage regularly</li>
                <li>Deactivate unused invitations periodically</li>
                <li>Use single-use per email to prevent duplicate signups</li>
              </ul>
            </div>
          </div>
        </section>

        <div className="my-6 border-t border-gray-200" />

        <section>
          <div className="flex items-center space-x-2 mb-2">
            <Info className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-base font-semibold">Workflow Summary</span>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <h4 className="font-medium text-sm">Step-by-Step Process</h4>
              <ol className="text-xs sm:text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>Admin creates an invitation with desired settings</li>
                <li>System generates a secure invitation link</li>
                <li>Admin shares the same link with multiple chapter members</li>
                <li>Each member follows the link and signs up with their unique email</li>
                <li>System validates the invitation and creates their account</li>
                <li>Member is assigned to the chapter with appropriate role and status</li>
              </ol>
            </div>
            <div className="bg-accent-50 p-2 sm:p-3 rounded-lg">
              <p className="text-xs sm:text-sm text-accent-800">
                <strong>Key Point:</strong> One invitation link can be used by multiple people with different email
                addresses, but each email can only use each invitation once.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div
        className={cn(
          'flex-shrink-0 border-t border-gray-200 bg-white px-4 py-4',
          isMobile && 'pb-[calc(1rem+env(safe-area-inset-bottom))]'
        )}
      >
        <Button
          type="button"
          onClick={() => onOpenChange(false)}
          className="w-full rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12"
        >
          Close
        </Button>
      </div>
    </div>
  );

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom" modal dismissible>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40 transition-opacity" />
        <Drawer.Content
          className={cn(
            'bg-white flex flex-col z-[10000] fixed bottom-0 left-0 right-0 shadow-2xl border border-gray-200 outline-none',
            isMobile
              ? 'max-h-[85dvh] rounded-t-[20px]'
              : 'max-h-[80vh] max-w-lg mx-auto rounded-t-[20px]'
          )}
        >
          {isMobile && (
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-1" aria-hidden />
          )}
          {drawerContent}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
