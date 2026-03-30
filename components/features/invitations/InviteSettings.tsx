'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InvitationStats } from '@/types/invitations';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface InviteSettingsProps {
  chapterId: string;
  onClose: () => void;
}

/** Above DashboardHeader (z-[100]); below app toast (zIndex 10004). */
const MODAL_OVERLAY_Z = 10000;
const MODAL_LAYER_Z = 10001;

export function InviteSettings({ chapterId, onClose }: InviteSettingsProps) {
  const [stats, setStats] = useState<InvitationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/invitations/stats?chapter_id=${chapterId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }

        const statsData = await response.json();
        setStats(statsData);
      } catch (error) {
        console.error('Error fetching invitation stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [chapterId]);

  // Content component (shared between mobile and desktop)
  const content = (
    <div className="flex flex-col h-full min-h-0">
      {/* Header - Fixed */}
      <div className="flex items-center justify-between p-4 md:p-6 border-b flex-shrink-0 bg-white">
        <h2 className="text-lg md:text-xl font-semibold flex items-center space-x-2">
          <span>Invitation Settings & Statistics</span>
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 space-y-4">
        {/* Statistics Overview */}
        {loading ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-6 w-6 animate-spin text-brand-accent" />
                <div className="text-center">
                  <h3 className="text-sm font-medium text-gray-900">Loading Statistics</h3>
                  <p className="text-xs text-gray-600">Fetching invitation data...</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : stats ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center space-x-2 text-base">
                <Info className="h-4 w-4 text-brand-accent" />
                <span>Invitation Statistics</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-xl md:text-2xl font-bold text-blue-500">{stats.total_invitations}</div>
                  <div className="text-xs md:text-sm text-gray-600">Total Invitations</div>
                </div>
                <div className="text-center">
                  <div className="text-xl md:text-2xl font-bold text-blue-400">{stats.active_invitations}</div>
                  <div className="text-xs md:text-sm text-gray-600">Active</div>
                </div>
                <div className="text-center">
                  <div className="text-xl md:text-2xl font-bold text-blue-300">{stats.total_usage}</div>
                  <div className="text-xs md:text-sm text-gray-600">Total Signups</div>
                </div>
                <div className="text-center">
                  <div className="text-xl md:text-2xl font-bold text-red-600">{stats.pending_approvals}</div>
                  <div className="text-xs md:text-sm text-gray-600">Pending Approval</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Information Cards */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center space-x-2 text-base">
                <Info className="h-4 w-4 text-brand-accent" />
                <span>How Invitations Work</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 space-y-2">
              <div className="space-y-1">
                <h4 className="font-medium text-sm">Single-Use Per Email</h4>
                <p className="text-xs md:text-sm text-gray-600">
                  Each email address can only use each invitation link once. This prevents duplicate signups while
                  allowing multiple people to use the same invitation with different emails.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="font-medium text-sm">Auto-Approval</h4>
                <p className="text-xs md:text-sm text-gray-600">
                  All invitations use auto-approval. New members gain immediate access after signup.
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="font-medium text-sm">Open Email Access</h4>
                <p className="text-xs md:text-sm text-gray-600">
                  All invitations accept any email address from any domain. This allows maximum flexibility for chapter
                  members to join using their preferred email address.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center space-x-2 text-base">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span>Security Best Practices</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 space-y-2">
              <div className="space-y-1">
                <h4 className="font-medium text-sm">Invitation Security</h4>
                <ul className="text-xs md:text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li>Each invitation generates a unique, secure token</li>
                  <li>Invitations can be deactivated at any time</li>
                  <li>Usage is tracked to prevent abuse</li>
                  <li>Expiration dates help limit exposure</li>
                </ul>
              </div>
              <div className="space-y-1">
                <h4 className="font-medium text-sm">Recommendations</h4>
                <ul className="text-xs md:text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li>Set reasonable expiration dates for invitations</li>
                  <li>Monitor invitation usage regularly</li>
                  <li>Deactivate unused invitations periodically</li>
                  <li>Use single-use per email to prevent duplicate signups</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center space-x-2 text-base">
                <Info className="h-4 w-4 text-green-600" />
                <span>Workflow Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 space-y-2">
              <div className="space-y-1">
                <h4 className="font-medium text-sm">Step-by-Step Process</h4>
                <ol className="text-xs md:text-sm text-gray-600 space-y-1 list-decimal list-inside">
                  <li>Admin creates an invitation with desired settings</li>
                  <li>System generates a secure invitation link</li>
                  <li>Admin shares the same link with multiple chapter members</li>
                  <li>Each member follows the link and signs up with their unique email</li>
                  <li>System validates the invitation and creates their account</li>
                  <li>Member is assigned to the chapter with appropriate role and status</li>
                </ol>
              </div>
              <div className="bg-accent-50 p-2 md:p-3 rounded-lg">
                <p className="text-xs md:text-sm text-accent-800">
                  <strong>Key Point:</strong> One invitation link can be used by multiple people with different email
                  addresses, but each email can only use each invitation once.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer - Fixed */}
      <div className="flex-shrink-0 border-t bg-white p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <Button
          onClick={onClose}
          className="w-full rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Close
        </Button>
      </div>
    </div>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: MODAL_OVERLAY_Z }}>
      <div
        role="presentation"
        aria-hidden
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity pointer-events-auto"
        style={{ zIndex: MODAL_OVERLAY_Z }}
        onClick={onClose}
      />

      {isMobile ? (
        <div
          className="fixed inset-0 flex items-end justify-center pointer-events-none p-0"
          style={{ zIndex: MODAL_LAYER_Z }}
        >
          <div
            className={cn(
              'pointer-events-auto w-full flex flex-col min-h-0 rounded-t-2xl bg-white shadow-xl',
              'max-h-[min(92dvh,100svh)] h-[min(92dvh,100svh)]'
            )}
          >
            {content}
          </div>
        </div>
      ) : (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
          style={{ zIndex: MODAL_LAYER_Z }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
              'pointer-events-auto bg-white rounded-lg max-w-2xl w-full flex flex-col min-h-0 overflow-hidden',
              'max-h-[min(90dvh,100svh)] h-[min(90dvh,100svh)]'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </motion.div>
        </div>
      )}
    </div>,
    document.body
  );
}
