'use client';

import { useRouter } from 'next/navigation';
import {
  User,
  Settings,
  Bell,
  LogOut,
  ChevronRight,
  ChevronDown,
  Lock,
  Smartphone,
  BellRing,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { usePwaPrompt } from '@/lib/contexts/PwaPromptContext';

interface UserDropdownProps {
  user: {
    email?: string | null;
    user_metadata?: { avatar_url?: string | null; full_name?: string };
    profile?: unknown;
  } | null;
  completionPercent: number;
  hasUnread: boolean;
  unreadCount?: number;
  onSignOut: () => void;
}

const MENU_ITEMS = [
  { label: 'View Profile', href: '/dashboard/profile', icon: User, locked: false },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell, key: 'notifications' as const, locked: false },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, locked: false },
];

export function UserDropdown({
  user,
  completionPercent,
  hasUnread,
  unreadCount = 0,
  onSignOut,
}: UserDropdownProps) {
  const router = useRouter();
  const { profile } = useProfile();
  const pwaPrompt = usePwaPrompt();
  const visibleMenuItems = MENU_ITEMS.filter((item) => !item.locked);

  const hasPwaOptions =
    pwaPrompt &&
    (pwaPrompt.canShowInstallPrompt || pwaPrompt.canShowPushExplainer);

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center space-x-2 rounded-2xl p-2 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
          aria-label="Account menu"
        >
          <UserAvatar
            user={{
              user_metadata: {
                avatar_url: profile?.avatar_url,
                full_name: profile?.full_name,
              },
            }}
            completionPercent={completionPercent}
            hasUnread={hasUnread}
            unreadCount={unreadCount}
            size="md"
          />
          <ChevronDown className="w-4 h-4 text-gray-600" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        {/* Profile completion banner */}
        {completionPercent < 100 && (
          <button
            type="button"
            onClick={() => router.push('/dashboard/profile')}
            className="mb-3 w-full rounded-lg border border-primary-200 bg-primary-50 p-3 text-left transition-colors hover:bg-primary-100 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-primary-900">
                  Complete your profile ({completionPercent}%)
                </p>
                <p className="mt-1 text-xs text-brand-primary">
                  Add missing information to unlock full features
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-brand-primary" />
            </div>
          </button>
        )}

        {/* Menu items */}
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.label}
              disabled={item.locked}
              onClick={() => !item.locked && item.href !== '#' && handleNavigate(item.href)}
              className={cn(
                'gap-2',
                item.locked && 'cursor-not-allowed opacity-60'
              )}
            >
              <Icon className={cn('h-4 w-4', item.locked && 'text-gray-400')} />
              <span className={item.locked ? 'line-through' : ''}>{item.label}</span>
              {item.locked && <Lock className="ml-auto h-3 w-3 text-gray-400" />}
              {item.key === 'notifications' && unreadCount > 0 && (
                <span className="ml-auto h-2 w-2 rounded-full border border-white bg-red-500 shadow-sm" />
              )}
            </DropdownMenuItem>
          );
        })}

        {hasPwaOptions && (
          <>
            <DropdownMenuSeparator />
            <div className="px-3 py-2">
              <p className="mb-1.5 text-xs font-medium text-gray-500">
                Get the most out of Trailblaize
              </p>
              <div className="space-y-0.5">
                {pwaPrompt.canShowInstallPrompt && (
                  <DropdownMenuItem
                    onClick={() => pwaPrompt.showInstallPrompt()}
                    className="gap-2 text-sm"
                  >
                    <Smartphone className="h-4 w-4" />
                    Add to Home Screen
                  </DropdownMenuItem>
                )}
                {pwaPrompt.canShowPushExplainer && (
                  <DropdownMenuItem
                    onClick={() => pwaPrompt.showPushExplainer()}
                    className="gap-2 text-sm"
                  >
                    <BellRing className="h-4 w-4" />
                    Enable notifications
                  </DropdownMenuItem>
                )}
              </div>
            </div>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onSignOut}
          className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
