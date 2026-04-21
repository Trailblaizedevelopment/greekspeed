'use client';
export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMessagingInbox } from '@/lib/hooks/useMessagingInbox';
import { MessagesSidebar } from '@/components/features/messaging/MessagesSidebar';
import { MessagesMainChat } from '@/components/features/messaging/MessagesMainChat';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MobileBottomNavigation } from '@/components/features/dashboard/dashboards/ui/MobileBottomNavigation';
import { useDashboardMessagesMobileChrome } from '@/lib/contexts/DashboardMessagesMobileChromeContext';

// ✅ Create a separate component that uses useSearchParams
function MessagesPageContent() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { connections, previews: inboxPreviews, loading } = useMessagingInbox();
  const searchParams = useSearchParams();
  const connectionId = searchParams.get('connection');
  const router = useRouter();
  const { setMobileMessageThreadFullscreen } = useDashboardMessagesMobileChrome();

  // Fullscreen mobile thread: hide global dashboard header (back in chat returns to list + header).
  useEffect(() => {
    const fullscreen = isMobile && !!selectedConnectionId;
    setMobileMessageThreadFullscreen(fullscreen);
    return () => setMobileMessageThreadFullscreen(false);
  }, [isMobile, selectedConnectionId, setMobileMessageThreadFullscreen]);

  // ✅ Prevent body scrolling on mobile when chat is open
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ✅ Prevent body scrolling on mobile when chat view is active
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const isMobile = window.innerWidth < 768;
    const showChatViewOnMobile = isMobile && selectedConnectionId;
    
    if (showChatViewOnMobile) {
      // Prevent body scrolling
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      // Restore body scrolling
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    return () => {
      // Cleanup: restore scrolling when component unmounts
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [selectedConnectionId, isMobile]);

  // ✅ Add effect to handle URL parameters
  useEffect(() => {
    const connectionParam = searchParams.get('connection');
    const shareProfileParam = searchParams.get('shareProfile');
    const profileTypeParam = searchParams.get('profileType');
    
    if (connectionParam) {
      const connectionExists = connections.some(conn => conn.id === connectionParam);
      if (connectionExists) {
        setSelectedConnectionId(connectionParam);
        // If sharing profile, keep the params for ConnectionChat to handle
        if (shareProfileParam && profileTypeParam) {
          // Keep share params in URL for ConnectionChat to read
        } else {
          router.replace('/dashboard/messages');
        }
      }
    } else if (shareProfileParam && profileTypeParam) {
      // If shareProfile param exists but no connection, show connections list
      // User should select a connection to share with
      router.replace('/dashboard/messages');
    }
  }, [searchParams, connections, router]);

  const handleConnectionSelect = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
  };

  const handleBack = () => {
    setSelectedConnectionId(null);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Handle browser back button
  useEffect(() => {
    const handlePopState = () => {
      if (selectedConnectionId) {
        setSelectedConnectionId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedConnectionId]);

  // Determine what to show on mobile
  const showListViewOnMobile = isMobile && !selectedConnectionId;
  const showChatViewOnMobile = isMobile && selectedConnectionId;

  return (
    // Use full screen height, prevent all scrolling on container
    <div className="h-screen sm:h-[calc(100vh-4rem)] flex flex-col overflow-hidden fixed inset-0 sm:relative sm:inset-auto">
      {/* Mobile Header - Only show when in list view */}
      {showListViewOnMobile && (
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <h1 className="text-lg font-semibold text-gray-900">Messages</h1>
        </div>
      )}

      {/* Main Layout - Prevent scrolling */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Collapsible Sidebar */}
        <div className="flex min-h-0">
          {/* Main Sidebar */}
          <AnimatePresence>
            {(showListViewOnMobile || (!isMobile && sidebarOpen)) && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ 
                  width: sidebarCollapsed && !isMobile ? 64 : (isMobile ? '100vw' : 320), 
                  opacity: 1 
                }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="bg-gray-50 border-r border-gray-200 shadow-sm overflow-hidden flex-shrink-0 h-full"
              >
                <MessagesSidebar
                  connections={connections}
                  loading={loading}
                  selectedConnectionId={selectedConnectionId}
                  onConnectionSelect={handleConnectionSelect}
                  onMobileMenuToggle={toggleSidebar}
                  isMobile={isMobile}
                  isMainView={showListViewOnMobile}
                  sidebarCollapsed={sidebarCollapsed && !isMobile}
                  onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                  onClose={() => !isMobile && setSidebarOpen(false)}
                  inboxHydrated
                  inboxPreviews={inboxPreviews}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sidebar Toggle Button (when sidebar is completely closed) */}
          {!isMobile && !sidebarOpen && (
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

        {/* Desktop: Always show main chat area */}
        {/* Mobile: Only show chat area when connection is selected */}
        {(!isMobile || showChatViewOnMobile) && (
          <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
            <MessagesMainChat
              selectedConnectionId={selectedConnectionId}
              connections={connections}
              onBack={handleBack}
              onConnectionSelect={handleConnectionSelect}
              isMobile={isMobile}
            />
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNavigation />
    </div>
  );
}

// ✅ Main component with Suspense boundary
export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading messages...</p>
        </div>
      </div>
    }>
      <MessagesPageContent />
    </Suspense>
  );
}