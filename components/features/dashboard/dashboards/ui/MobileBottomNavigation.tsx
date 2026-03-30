'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Users, Wrench, CreditCard, User, CheckSquare, FileText, Activity, X, Search, Building2, LucideIcon, MessageSquare, Calendar, Megaphone, Settings, UserPlus } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';

export type MobileTab = 'home' | 'tasks' | 'announcements' | 'calendar' | 'events';

export interface NavigationTab {
  id: string;
  label: string;
  icon: LucideIcon;
  route?: string; // Optional route for navigation
  onClick?: () => void; // Optional callback if not using routes
  isToolsTab?: boolean; // Flag to indicate this is a tools tab that shows sub-options
}

interface MobileBottomNavigationProps {
  activeTab?: MobileTab | string;
  onTabChange?: (tab: MobileTab | string) => void;
  // New props for dynamic configuration
  tabs?: NavigationTab[]; // Custom tabs configuration (overrides role-based)
  showToolsMenu?: boolean; // Whether to show tools FAB (default: true for active members)
  toolsOptions?: Array<{
    id: string;
    label: string;
    icon: LucideIcon;
    onClick: () => void;
  }>;
  toolsAsTab?: boolean; // When true, tools is a regular tab with sub-options above footer
  userRole?: string; // Optional role override (otherwise uses useProfile)
}

function MobileBottomNavigationImpl({ 
  activeTab, 
  onTabChange,
  tabs: customTabs,
  showToolsMenu = true,
  toolsOptions: customToolsOptions,
  toolsAsTab = false,
  userRole: propUserRole
}: MobileBottomNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useProfile();
  const userRole = propUserRole || profile?.role;
  const { enabled: financialToolsEnabled } = useFeatureFlag('financial_tools_enabled');
  const { enabled: eventsManagementEnabled } = useFeatureFlag('events_management_enabled');
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [buttonPosition, setButtonPosition] = useState<{ left: number; bottom: number } | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);

  // Role-based tab configurations
  const getRoleBasedTabs = (): NavigationTab[] => {
    if (userRole === 'alumni') {
      // Alumni: 5 tabs, evenly spaced (no FAB)
      return [
        {
          id: 'home',
          label: 'Home',
          icon: Home,
          route: '/dashboard',
        },
        {
          id: 'network',
          label: 'Network',
          icon: Users,
          route: '/dashboard?tab=network',
        },
        {
          id: 'pipeline',
          label: 'Pipeline',
          icon: Search,
          route: '/dashboard?tab=pipeline',
        },
        {
          id: 'chapter',
          label: 'Members',
          icon: Building2,
          route: '/dashboard?tab=chapter',
        },
        {
          id: 'profile',
          label: 'Profile',
          icon: User,
          route: '/dashboard/profile',
        },
      ];
    } else if (userRole === 'admin') {
      // Admin: 4 tabs + FAB (HOME, ALUMNI, MESSAGES, PROFILE)
      return [
        {
          id: 'home',
          label: 'Home',
          icon: Home,
          route: '/dashboard',
        },
        {
          id: 'alumni',
          label: 'Alumni',
          icon: Users,
          route: '/dashboard/alumni',
        },
        {
          id: 'messages',
          label: 'Messages',
          icon: MessageSquare,
          route: '/dashboard/messages',
        },
        {
          id: 'profile',
          label: 'Profile',
          icon: User,
          route: '/dashboard/profile',
        },
      ];
    } else {
      // Active Member: 4 tabs + FAB (HOME, ALUMNI, MESSAGES, PROFILE)
      return [
        {
          id: 'home',
          label: 'Home',
          icon: Home,
          route: '/dashboard',
        },
        {
          id: 'alumni',
          label: 'Alumni',
          icon: Users,
          route: '/dashboard/alumni',
        },
        {
          id: 'messages',
          label: 'Messages',
          icon: MessageSquare,
          route: '/dashboard/messages',
        },
        {
          id: 'profile',
          label: 'Profile',
          icon: User,
          route: '/dashboard/profile',
        },
      ];
    }
  };

  // Role-based tools options
  const getRoleBasedToolsOptions = () => {
    if (userRole === 'admin') {
      const options = [
        {
          id: 'tasks',
          label: 'Tasks',
          icon: CheckSquare,
          onClick: () => handleToolsOptionClick('tasks'),
        },
        {
          id: 'operations',
          label: 'Ops',
          icon: Settings,
          onClick: () => handleToolsOptionClick('operations'),
        },
        // Conditionally show Events or Invites based on flag
        ...(eventsManagementEnabled ? [{
          id: 'events',
          label: 'Events',
          icon: Calendar,
          onClick: () => handleToolsOptionClick('events'),
        }] : [{
          id: 'invites',
          label: 'Invites',
          icon: UserPlus, // You may need to import UserPlus if not already imported
          onClick: () => handleToolsOptionClick('invites'), // You'll need to handle this in AdminOverview
        }]),
      ];
      return options;
    } else {
      // Active Member: dues, announcements, calendar
      const options = [
        {
          id: 'dues',
          label: 'Dues',
          icon: CreditCard,
          onClick: () => handleToolsOptionClick('dues'),
        },
        {
          id: 'announcements',
          label: 'News', // Changed from 'Announcements'
          icon: Megaphone,
          onClick: () => handleToolsOptionClick('announcements'),
        },
        {
          id: 'calendar',
          label: 'Calendar', // Changed from 'Calendar' for better fit
          icon: Calendar,
          onClick: () => handleToolsOptionClick('calendar'),
        },
      ];
      
      // Filter out dues if financial tools are disabled
      // Filter out calendar if events management is disabled
      return options.filter(opt => {
        if (opt.id === 'dues' && !financialToolsEnabled) return false;
        if (opt.id === 'calendar' && !eventsManagementEnabled) return false;
        return true;
      });
    }
  };

  // Use custom tabs if provided, otherwise use role-based tabs
  const roleBasedTabs = getRoleBasedTabs();
  const tabs = customTabs || roleBasedTabs;

  // Only use tools as tab if explicitly set (not for admin/active_member - they use FAB)
  const shouldUseToolsAsTab = toolsAsTab && userRole !== 'admin' && userRole !== 'active_member';

  // Determine active tab based on pathname or prop
  const getActiveTab = (): string => {
    if (activeTab) return activeTab;
    
    // For alumni, check if we're on profile page
    if (userRole === 'alumni' && pathname === '/dashboard/profile') {
      return 'profile';
    }
    
    // For alumni on dashboard, check query params for tab first
    if (userRole === 'alumni' && pathname === '/dashboard') {
      const tabParam = searchParams.get('tab');
      if (tabParam && ['network', 'pipeline', 'chapter'].includes(tabParam)) {
        return tabParam;
      }
      // Default to home for dashboard
      return 'home';
    }
    
    // Try to match by route (exact pathname match, ignoring query params)
    const currentTab = tabs.find(tab => {
      if (!tab.route) return false;
      // Extract pathname from route (remove query params)
      const routePathname = tab.route.split('?')[0];
      return pathname === routePathname;
    });
    if (currentTab) return currentTab.id;
    
    // Fallback to first tab
    return tabs[0]?.id || 'home';
  };

  const currentActiveTab = getActiveTab();

  // Use custom tools options if provided, otherwise use role-based
  const roleBasedToolsOptions = getRoleBasedToolsOptions();
  const toolsOptions = customToolsOptions || roleBasedToolsOptions;

  // Calculate whether to show FAB: show for admin/active_member (4 tabs), or if explicitly enabled
  // Alumni uses 5 tabs grid (no FAB)
  const shouldShowFAB = (userRole === 'admin' || userRole === 'active_member') ? true : (showToolsMenu && tabs.length <= 4 && !shouldUseToolsAsTab);
  const hasToolsFAB = shouldShowFAB;

  // Determine layout: 5 tabs = grid (alumni), otherwise FAB layout (admin/active_member)
  const useGridLayout = tabs.length === 5;

  // Close tools menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (
        isToolsMenuOpen &&
        hasToolsFAB &&
        toolsMenuRef.current &&
        toolsButtonRef.current &&
        !toolsMenuRef.current.contains(event.target as Node) &&
        !toolsButtonRef.current.contains(event.target as Node)
      ) {
        setIsToolsMenuOpen(false);
        setButtonPosition(null);
      }
    };

    if (isToolsMenuOpen && hasToolsFAB) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isToolsMenuOpen, hasToolsFAB]);

  // Close tools menu on route change
  useEffect(() => {
    setIsToolsMenuOpen(false);
    setButtonPosition(null);
  }, [pathname]);

  // Recalculate button position on window resize
  useEffect(() => {
    const handleResize = () => {
      if (isToolsMenuOpen && toolsButtonRef.current && hasToolsFAB) {
        const rect = toolsButtonRef.current.getBoundingClientRect();
        setButtonPosition({
          left: rect.left + rect.width / 2,
          bottom: window.innerHeight - rect.bottom + 80
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isToolsMenuOpen, hasToolsFAB]);

  const handleTabClick = (tab: NavigationTab) => {
    // Regular tab navigation
    if (tab.route) {
      router.push(tab.route);
    } else if (tab.onClick) {
      tab.onClick();
    }
    
    if (onTabChange) {
      onTabChange(tab.id);
    }
    setIsToolsMenuOpen(false);
  };

  const handleToolsClick = () => {
    if (!isToolsMenuOpen && toolsButtonRef.current && hasToolsFAB) {
      setTimeout(() => {
        requestAnimationFrame(() => {
          if (toolsButtonRef.current) {
            const rect = toolsButtonRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const baseBottomPosition = window.innerHeight - rect.bottom + 80;
            
            setButtonPosition({
              left: centerX,
              bottom: baseBottomPosition
            });
          }
        });
      }, 200);
    } else {
      setButtonPosition(null);
    }
    setIsToolsMenuOpen(!isToolsMenuOpen);
  };

  const handleToolsOptionClick = (option: string) => {
    setIsToolsMenuOpen(false);
    setButtonPosition(null);
    
    // For admin and active_member, use query param navigation (FAB style)
    if (userRole === 'admin' || userRole === 'active_member') {
      router.push(`/dashboard?tool=${option}`);
      if (onTabChange) {
        const tabMap: Record<string, MobileTab | string> = {
          tasks: 'tasks',
          operations: 'operations',
          events: 'events',
          invites: 'invites', // Changed from 'events' to 'invites'
          docs: 'tasks',
          ops: 'operations',
          dues: 'tasks',
          announcements: 'announcements',
          calendar: 'calendar',
        };
        onTabChange(tabMap[option] || 'home');
      }
    } else if (shouldUseToolsAsTab) {
      // When tools is a tab (for other roles), update the active tab state
      if (onTabChange) {
        onTabChange(option);
      }
    } else {
      // Fallback: navigate with query param
      router.push(`/dashboard?tool=${option}`);
      if (onTabChange) {
        const tabMap: Record<string, MobileTab | string> = {
          tasks: 'tasks',
          operations: 'operations',
          events: 'events',
          invites: 'invites', // Changed from 'events' to 'invites'
          docs: 'tasks',
          ops: 'operations',
          dues: 'tasks',
          announcements: 'announcements',
          calendar: 'calendar',
        };
        onTabChange(tabMap[option] || 'home');
      }
    }
  };

  return (
    <>

      {/* Detached Footer Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden pointer-events-none">
        <div className="mx-2 mb-2 pointer-events-auto">
          <div className="relative bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-100">
            {useGridLayout ? (
              // 5 tabs grid layout (for alumni only - evenly spaced)
              <div className="grid grid-cols-5 h-16 px-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = currentActiveTab === tab.id;
                  
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab)}
                      className={`flex flex-col items-center justify-center space-y-1 transition-colors relative ${
                        isActive ? 'text-brand-primary' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${isActive ? 'text-brand-primary' : 'text-gray-500'}`} />
                      <span className={`text-xs font-medium ${isActive ? 'text-brand-primary' : 'text-gray-500'}`}>
                        {tab.label}
                      </span>
                      {isActive && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute bottom-0 inset-x-0 mx-auto w-8 h-0.5 bg-brand-primary rounded-full"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              // FAB layout with 4 tabs + circular tools button (for admin and active_member)
              <div className="flex items-center justify-between px-2 py-3 h-16">
                {/* Left Section: First 2 tabs */}
                <div className="flex items-center flex-1 min-w-0">
                  {tabs.slice(0, 2).map((tab) => {
                    const Icon = tab.icon;
                    const isActive = currentActiveTab === tab.id;
                    
                    return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab)}
                      className={`flex flex-col items-center justify-center flex-1 min-w-0 transition-colors relative ${
                        isActive ? 'text-brand-primary' : 'text-gray-500'
                      }`}
                    >
                      <Icon className={`h-5 w-5 mb-0.5 ${isActive ? 'text-brand-primary' : 'text-gray-500'}`} />
                      <span className={`text-xs font-medium truncate ${isActive ? 'text-brand-primary' : 'text-gray-500'}`}>
                        {tab.label}
                      </span>
                      {isActive && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute bottom-0 inset-x-0 mx-auto w-8 h-0.5 bg-brand-primary rounded-full"
                        />
                      )}
                    </button>
                    );
                  })}
                </div>

                {/* Center Section: Tools FAB - Grey circular button */}
                {hasToolsFAB && (
                  <div className="relative flex-shrink-0 mx-1">
                    <button
                      ref={toolsButtonRef}
                      onClick={handleToolsClick}
                      className={`relative h-14 w-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                        isToolsMenuOpen
                          ? 'bg-brand-primary text-white scale-110'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {isToolsMenuOpen ? (
                        <X className="h-6 w-6" />
                      ) : (
                        <Wrench className="h-6 w-6" />
                      )}
                    </button>
                  </div>
                )}

                {/* Right Section: Last 2 tabs */}
                <div className="flex items-center flex-1 min-w-0">
                  {tabs.slice(2).map((tab) => {
                    const Icon = tab.icon;
                    const isActive = currentActiveTab === tab.id;
                    
                    return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab)}
                      className={`flex flex-col items-center justify-center flex-1 min-w-0 transition-colors relative ${
                        isActive ? 'text-brand-primary' : 'text-gray-500'
                      }`}
                    >
                      <Icon className={`h-5 w-5 mb-0.5 ${isActive ? 'text-brand-primary' : 'text-gray-500'}`} />
                      <span className={`text-xs font-medium truncate ${isActive ? 'text-brand-primary' : 'text-gray-500'}`}>
                        {tab.label}
                      </span>
                      {isActive && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute bottom-0 inset-x-0 mx-auto w-8 h-0.5 bg-brand-primary rounded-full"
                        />
                      )}
                    </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tools Popup Menu - Original FAB style with pyramid shape */}
      {hasToolsFAB && (
        <AnimatePresence>
          {isToolsMenuOpen && buttonPosition && (
            <div
              ref={toolsMenuRef}
              className="fixed z-50 sm:hidden"
              style={{
                left: `${buttonPosition.left}px`,
                bottom: `${buttonPosition.bottom}px`,
                transform: 'translateX(-50%)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`relative flex items-end ${toolsOptions.length === 2 ? 'gap-4' : 'gap-3'}`}>
                {toolsOptions.map((option, index) => {
                  const Icon = option.icon;
                  const usePyramid = toolsOptions.length >= 3;
                  const isCenter = usePyramid && index === Math.floor(toolsOptions.length / 2);
                  
                  return (
                    <motion.button
                      key={option.id}
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      onClick={option.onClick}
                      className="flex flex-col items-center justify-center h-14 w-14 rounded-full bg-white shadow-lg border border-gray-200 hover:bg-brand-primary/10 hover:border-brand-primary/30 text-gray-700 hover:text-brand-primary transition-all duration-200 group shrink-0 relative"
                      style={{ marginBottom: isCenter ? '12px' : '0px' }}
                      title={option.label} 
                    >
                      <Icon className="h-5 w-5 mb-0.5 group-hover:text-brand-primary transition-colors" />
                      <span className="text-[10px] font-medium group-hover:text-brand-primary transition-colors px-1 text-center leading-tight">
                        {option.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}

// Wrap in Suspense to handle useSearchParams during SSR/prerendering
export function MobileBottomNavigation(props: MobileBottomNavigationProps) {
  return (
    <Suspense fallback={null}>
      <MobileBottomNavigationImpl {...props} />
    </Suspense>
  );
}
