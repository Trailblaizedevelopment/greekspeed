'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { UserDropdown } from '@/components/features/profile/UserDropdown';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useConnections } from '@/lib/contexts/ConnectionsContext';
import { ProfileService } from '@/lib/services/profileService';
import { MessageCircle, Lock } from 'lucide-react';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { useChapterLogo } from '@/lib/hooks/useChapterLogo';
import { ChapterSwitcher } from '@/components/features/dashboard/ChapterSwitcher';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
// Small helper for consistent tab styling
function NavLink({
  href,
  label,
  locked = false,
}: {
  href: string;
  label: string;
  locked?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  if (locked) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center h-8 rounded-full px-3 sm:px-4 text-sm font-medium transition-all duration-200 opacity-60 cursor-not-allowed shadow-sm',
          'text-gray-400'
        )}
        title="Feature coming soon!"
      >
        {label}
        <Lock className="h-3 w-3 ml-1.5 text-gray-400" />
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center justify-center h-8 rounded-full px-3 sm:px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-focus gap-1.5',
        isActive
          ? 'bg-brand-primary/10 text-brand-primary font-medium shadow-sm hover:bg-brand-primary/20 hover:shadow-md'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:shadow-sm shadow-sm'
      )}
    >
      <span>{label}</span>
    </Link>
  );
}

export function DashboardHeader() {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { connections } = useConnections();
  const userRole = profile?.role;
  const pathname = usePathname();
  const { activeChapterId } = useActiveChapter();
  
  // Check if financial tools feature is enabled
  const { enabled: financialToolsEnabled, loading: flagLoading } = useFeatureFlag('financial_tools_enabled');

  // Get dynamic logo URL from branding system
  const logoUrl = useChapterLogo();

  // Check if this is the default logo or an uploaded logo
  const isDefaultLogo = logoUrl === '/logo.png' || logoUrl.endsWith('/logo.png');

  // Count pending connection requests that require action
  const pendingConnections = connections.filter(conn =>
    conn.status === 'pending' && conn.recipient_id === user?.id
  ).length;

  const completion = profile ? ProfileService.calculateCompletion(profile) : null;
  const completionPercent = completion?.percentage ?? 0;
  const hasUnread = pendingConnections > 0; // Now based on actual pending connections

  const isGovernance = userRole === 'governance';

  type NavTabConfig = {
    href: string;
    label: string;
    roles: string[];
    locked: boolean;
  };

  // Define navigation tabs with role-based access
  const navigationTabs: NavTabConfig[] = [
    { href: isGovernance ? '/dashboard/governance' : '/dashboard', label: 'Home', roles: ['admin', 'active_member', 'alumni', 'governance'], locked: false },
    { href: '/dashboard/alumni', label: 'Alumni', roles: ['admin', 'active_member', 'alumni', 'governance'], locked: false },
    { href: '/dashboard/dues', label: 'Dues', roles: ['active_member', 'admin', 'governance'], locked: false },
    { href: '/dashboard/admin', label: 'Exec Admin', roles: ['admin', 'governance'], locked: false },
  ];

  // Filter tabs based on user role
  const visibleTabs = navigationTabs.filter(tab => {
    // Governance: always see all tabs (same as admin), with dues gated by feature flag
    if (isGovernance) {
      if (tab.href === '/dashboard/dues') {
        return financialToolsEnabled && !flagLoading;
      }
      return true;
    }
    // Developers viewing a chapter can see ALL tabs (full admin access for that context)
    if (profile?.is_developer && activeChapterId) {
      if (tab.href === '/dashboard/dues') {
        return financialToolsEnabled && !flagLoading;
      }
      return true;
    }

    // Non-developer/non-governance: check role access
    const hasRoleAccess = tab.roles.includes(userRole || '');

    if (tab.href === '/dashboard/dues') {
      return hasRoleAccess && financialToolsEnabled && !flagLoading;
    }

    return hasRoleAccess;
  });

  const handleSignOut = async () => {
    try {
      await signOut();
      // Redirect to landing page after successful sign out
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
      // Even if there's an error, redirect to landing page
      window.location.href = '/';
    }
  };

  // Only show messages icon for alumni (not admin/exec)
  const showMessagesIcon = userRole === 'alumni';

  return (
    <header className="border-b border-gray-200/60 bg-white/95 backdrop-blur-sm z-[100] sticky top-0">
      <div className="w-full px-4 sm:px-6 pl-2 sm:pl-6 h-14 flex items-center justify-between">
        {/* Left side - Logo/Branding + Divider + Navigation tabs */}
        <div className="flex items-center space-x-4 sm:space-x-6 flex-shrink-0">
          {/* Logo/Branding - Now visible on both mobile and desktop */}
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center hover:opacity-80 transition-opacity",
              !isDefaultLogo && "h-full overflow-hidden max-w-[448px]"
            )}
          >
            {isDefaultLogo ? (
              <img
                src={logoUrl}
                alt="Trailblaize"
                className="h-28 w-auto object-contain transition-all duration-300"
              />
            ) : (
              <div className="h-full max-h-[56px] flex items-center overflow-hidden max-w-full py-1">
                <img
                  src={logoUrl}
                  alt="Trailblaize"
                  className="max-h-[44px] w-auto max-w-full object-contain transition-all duration-300"
                />
              </div>
            )}
          </Link>

          {/* Vertical Divider */}
          <div className="hidden sm:block h-6 w-px bg-slate-200" />

          {/* Desktop Navigation - Now appears next to logo with divider */}
          <div className="hidden sm:flex items-center space-x-1">
            {visibleTabs.map((tab) => (
              <NavLink
                key={tab.href}
                href={tab.href}
                label={tab.label}
                locked={tab.locked}
              />
            ))}
          </div>

          {/* Chapter Switcher - Developer or Governance (desktop: next to tabs) */}
          {(profile?.is_developer || isGovernance) && (
            <div className="hidden md:block">
              <ChapterSwitcher />
            </div>
          )}
        </div>

        {/* Right side - Messages icon, Chapter Switcher (mobile), and User dropdown */}
        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
          {/* Chapter Switcher - Developer or Governance (mobile: next to avatar) */}
          {(profile?.is_developer || isGovernance) && (
            <div className="md:hidden">
              <ChapterSwitcher />
            </div>
          )}
          {/* Messages Icon Button */}
          {/* Desktop: Show for ALL roles */}
          <Link
            href="/dashboard/messages"
            className={cn(
              'hidden sm:flex items-center justify-center h-8 w-8 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-focus shadow-sm',
              pathname === '/dashboard/messages'
                ? 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 hover:shadow-md'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:shadow-md'
            )}
          >
            <MessageCircle className="w-4.5 h-4.5" />
          </Link>

          {/* Mobile: Only show for alumni */}
          {showMessagesIcon && (
            <Link
              href="/dashboard/messages"
              className={cn(
                'sm:hidden flex items-center justify-center h-8 w-8 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-focus shadow-sm',
                pathname === '/dashboard/messages'
                  ? 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 hover:shadow-md'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:shadow-md'
              )}
            >
              <MessageCircle className="w-4.5 h-4.5" />
            </Link>
          )}

          <UserDropdown
            user={user}
            completionPercent={completionPercent}
            hasUnread={hasUnread}
            unreadCount={pendingConnections}
            onSignOut={handleSignOut}
          />
        </div>
      </div>
    </header>
  );
}