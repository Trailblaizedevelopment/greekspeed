'use client';

import { useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { DeveloperSidebar, type DeveloperView } from './ui/DeveloperSidebar';
import { UserGrowthDashboard } from './UserGrowthDashboard';

interface DeveloperPortalProps {
  children?: React.ReactNode;
}

// Helper function to determine view from pathname
function getViewFromPathname(pathname: string): DeveloperView {
  if (pathname === '/dashboard/user-management') {
    return 'user-management';
  } else if (pathname === '/dashboard/feature-flags') {
    return 'feature-flags';
  } else if (pathname === '/dashboard/developer/branding') {
    return 'branding';
  } else if (pathname === '/dashboard/developer/notifications') {
    return 'notifications';
  } else if (pathname === '/dashboard' || pathname === '/dashboard/') {
    return 'overview';
  }
  return 'overview';
}

export function DeveloperPortal({ children }: DeveloperPortalProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Derive active view from pathname immediately (no initial state delay)
  const activeView = useMemo(() => getViewFromPathname(pathname), [pathname]);

  const handleViewChange = (view: DeveloperView) => {
    // Navigate to the appropriate route
    switch (view) {
      case 'overview':
        router.push('/dashboard');
        break;
      case 'user-management':
        router.push('/dashboard/user-management');
        break;
      case 'feature-flags':
        router.push('/dashboard/feature-flags');
        break;
      case 'branding':
        router.push('/dashboard/developer/branding');
        break;
      case 'notifications':
        router.push('/dashboard/developer/notifications');
        break;
    }
  };

  // Render overview (scroll-free) or other pages (with scroll)
  const renderContent = () => {
    if (activeView === 'overview') {
      // Overview page - scroll-free
      return (
        <div 
          className="w-full bg-gray-50 overflow-hidden flex flex-col min-h-0"
          style={{
            height: 'calc(100vh - 4rem)',
            maxHeight: 'calc(100vh - 4rem)',
            minHeight: 'calc(100dvh - 4rem)',
          }}
        >
          <div 
            className="max-w-7xl mx-auto w-full flex-1 flex flex-col overflow-hidden px-4 py-4 sm:px-6 lg:px-8 min-h-0"
          >
            <div className="flex-1 min-h-0 overflow-hidden">
              <UserGrowthDashboard />
            </div>
          </div>
        </div>
      );
    } else {
      // Other pages - allow scroll
      return (
        <div className="flex-1 overflow-y-auto bg-gray-50 min-h-0">
          {children}
        </div>
      );
    }
  };

  return (
    <div 
      className="flex h-full bg-gray-50 overflow-hidden min-h-0" 
      style={{ 
        height: 'calc(100vh - 4rem)', 
        minHeight: 'calc(100dvh - 4rem)', 
      }} 
    >
      {/* Left Sidebar */}
      <DeveloperSidebar
        activeView={activeView}
        onViewChange={handleViewChange}
      />

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeView}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-w-0 min-h-0 flex flex-col"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
