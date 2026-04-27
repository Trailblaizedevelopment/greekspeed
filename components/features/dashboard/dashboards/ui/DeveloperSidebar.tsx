'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Flag, Palette, Bell, Database, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type DeveloperView =
  | 'overview'
  | 'user-management'
  | 'feature-flags'
  | 'branding'
  | 'notifications'
  | 'seed-spaces';

interface DeveloperSidebarProps {
  activeView: DeveloperView;
  onViewChange: (view: DeveloperView) => void;
}

// Top-level navigation items
const navigationItems = [
  { id: 'overview' as DeveloperView, label: 'Overview', icon: LayoutDashboard },
  { id: 'user-management' as DeveloperView, label: 'User Management', icon: Users },
  { id: 'feature-flags' as DeveloperView, label: 'Feature Flags', icon: Flag },
  { id: 'branding' as DeveloperView, label: 'Branding Management', icon: Palette },
  { id: 'notifications' as DeveloperView, label: 'Test Notifications', icon: Bell },
  { id: 'seed-spaces' as DeveloperView, label: 'Seed spaces', icon: Database },
];

export function DeveloperSidebar({
  activeView,
  onViewChange
}: DeveloperSidebarProps) {
  // Collapsible sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Set mobile-specific initial state
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true); // Start collapsed on mobile
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="flex">
      {/* Main Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ 
              width: sidebarCollapsed ? 64 : (isMobile ? 280 : 256), 
              opacity: 1 
            }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="bg-white border-r border-gray-200 shadow-sm overflow-hidden flex-shrink-0"
          >
            <div className="h-full flex flex-col">
              {/* Header */}
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 whitespace-nowrap min-w-0">
                    {!sidebarCollapsed && (
                      <motion.h3 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="font-semibold text-gray-900 truncate text-base sm:text-sm md:text-md"
                        style={{ lineHeight: 1, minWidth: 0 }}
                      >
                        Developer Portal
                      </motion.h3>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                      className="h-8 w-8 p-0"
                    >
                      {sidebarCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4 rotate-180" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidebarOpen(false)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Navigation Items */}
              <nav className="flex-1 overflow-y-auto p-4">
                {sidebarCollapsed ? (
                  // Collapsed view - show only icons
                  <div className="space-y-4">
                    <div className="flex flex-col items-center space-y-2">
                      {navigationItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeView === item.id;
                        
                        return (
                          <Button
                            key={item.id}
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-10 w-10 p-0 rounded-lg transition-colors",
                              isActive
                                ? "bg-white text-gray-900 hover:bg-white shadow-lg"
                                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                            )}
                            onClick={() => onViewChange(item.id)}
                            title={item.label}
                          >
                            <Icon className="h-5 w-5" />
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  // Expanded view - show full navigation
                  <div className="space-y-1">
                    {navigationItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeView === item.id;

                      return (
                        <button
                          key={item.id}
                          onClick={() => onViewChange(item.id)}
                          className={cn(
                            "w-full flex items-center space-x-3 px-3 py-2 rounded-full text-sm font-medium transition-all duration-150",
                            isActive
                              ? "bg-white text-gray-900 font-medium shadow-lg"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          )}
                        >
                          <Icon className={cn(
                            "h-5 w-5 transition-colors",
                            isActive ? "text-gray-700" : "text-gray-500"
                          )} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Toggle Button (when sidebar is completely closed) */}
      {!sidebarOpen && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="h-12 w-8 bg-white border-r border-gray-200 shadow-sm rounded-r-lg hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
