"use client";

import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer } from "vaul";
import { Filter, X, ChevronRight, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlumniFilterBar } from "./AlumniFilterBar";
import { useVisualViewportHeight } from "@/lib/hooks/useVisualViewportHeight";
import { AlumniTableView } from "./AlumniTableView";
import { EnhancedAlumniCard } from "./EnhancedAlumniCard";
import { Alumni } from "@/lib/alumniConstants";
import { AlumniProfileModal } from "./AlumniProfileModal";
import { AlumniPagination } from "./AlumniPagination";
import { AlumniCardSkeletonGrid } from "./AlumniCardSkeleton";

interface FilterState {
  searchTerm: string;
  graduationYear: string;
  industry: string;
  state: string;
  activelyHiring: boolean;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface AlumniPipelineLayoutProps {
  alumni: Alumni[];
  loading: boolean;
  error: string | null;
  viewMode: 'table' | 'card';
  selectedAlumni: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  onRetry: () => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearFilters: () => void;
  onAlumniClick?: (alumni: Alumni) => void;
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  mobileFiltersOpen: boolean;
  onMobileFiltersOpenChange: (open: boolean) => void;
}

export function AlumniPipelineLayout({
  alumni,
  loading,
  error,
  viewMode,
  selectedAlumni,
  onSelectionChange,
  onRetry,
  filters,
  onFiltersChange,
  onClearFilters,
  onAlumniClick,
  pagination,
  onPageChange,
  mobileFiltersOpen,
  onMobileFiltersOpenChange,
}: AlumniPipelineLayoutProps) {
  const selectDropdownPortalRef = useRef<HTMLDivElement>(null);
  const { height: visualHeight, offsetTop: vvOffsetTop } = useVisualViewportHeight();
  const [fullInnerHeight, setFullInnerHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 768
  );

  useEffect(() => {
    setFullInnerHeight(window.innerHeight);
  }, []);

  const keyboardOpen = mobileFiltersOpen && visualHeight < fullInnerHeight - 50;
  const mobileDrawerStyle: CSSProperties | undefined = keyboardOpen
    ? {
        maxHeight: visualHeight,
        bottom: fullInnerHeight - (vvOffsetTop + visualHeight),
        transition: "max-height 0.15s ease-out, bottom 0.15s ease-out",
      }
    : undefined;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedAlumniDetail, setSelectedAlumniDetail] = useState<Alumni | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleAlumniClick = (alumni: Alumni) => {
    // Use the parent's handler if provided, otherwise use local state
    if (onAlumniClick) {
      onAlumniClick(alumni);
    } else {
      setSelectedAlumniDetail(alumni);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAlumniDetail(null);
  };

  // Show all alumni without pagination
  const displayAlumni = alumni;

  return (
    <div className="flex min-h-[100dvh] md:h-screen bg-gray-50 md:overflow-hidden">
      {/* Desktop (md+): collapsible filter sidebar. Mobile: filters in bottom drawer. */}
      <div className="hidden md:flex flex-shrink-0">
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{
                width: sidebarCollapsed ? 64 : 320,
                opacity: 1,
              }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="bg-white border-r border-gray-200 shadow-sm overflow-hidden flex-shrink-0"
            >
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Filter className="h-5 w-5 text-brand-primary flex-shrink-0" />
                      {!sidebarCollapsed && (
                        <motion.h3 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="font-semibold text-gray-900"
                        >
                          Filters
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

                {/* Filters */}
                <div className="flex-1 overflow-y-auto p-4">
                  {sidebarCollapsed ? (
                    // Collapsed view - show only icons
                    <div className="space-y-4">
                      <div className="flex flex-col items-center space-y-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 w-10 p-0"
                          onClick={() => setSidebarCollapsed(false)}
                        >
                          <Search className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 w-10 p-0"
                          onClick={() => setSidebarCollapsed(false)}
                        >
                          <Users className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 w-10 p-0"
                          onClick={() => setSidebarCollapsed(false)}
                        >
                          <Filter className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Expanded view - show full filters
                    <AlumniFilterBar
                      filters={filters}
                      onFiltersChange={onFiltersChange}
                      onClearFilters={onClearFilters}
                      isSidebar={true}
                    />
                  )}
                </div>
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

      {/* Main Content Area */}
      <div className="flex-1 flex min-w-0 flex-col overflow-hidden">
        {/* Content with scrollable container */}
        <div className="flex-1 overflow-hidden relative z-10">
          {loading ? (
            <div className="flex-1 overflow-y-auto p-2 sm:p-6 pb-20">
              <AlumniCardSkeletonGrid count={24} />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={onRetry} variant="outline">
                  Try Again
                </Button>
              </div>
            </div>
          ) : viewMode === 'table' ? (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-y-auto">
                <AlumniTableView 
                  alumni={displayAlumni}
                  selectedAlumni={selectedAlumni}
                  onSelectionChange={onSelectionChange}
                />
              </div>
              {/* Pagination Controls for Table View */}
              <AlumniPagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.total}
                itemsPerPage={pagination.limit}
                onPageChange={onPageChange}
              />
            </div>
          ) : (
            <div className="h-full flex flex-col relative">
              {/* Scrollable cards container */}
              {/* Updated: Add bottom padding to account for bottom nav + safe area on mobile */}
              <div className="flex-1 md:overflow-y-auto p-1 sm:p-3 pb-[calc(120px+env(safe-area-inset-bottom))] sm:pb-20">
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1 sm:gap-2 md:gap-3">
                  {displayAlumni.map((alumniItem: Alumni, index: number) => (
                    <motion.div
                      key={alumniItem.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ 
                        duration: 0.2, 
                        delay: Math.min(index * 0.01, 0.2)
                      }}
                    >
                      <EnhancedAlumniCard
                        alumni={alumniItem}
                        onClick={handleAlumniClick}
                      />
                    </motion.div>
                  ))}
                </div>
                
                {/* Pagination Controls for Cards View */}
                {/* Updated: Remove fixed/sticky positioning - let it flow naturally in document */}
                {pagination.totalPages > 1 && (
                  <AlumniPagination
                    currentPage={pagination.page}
                    totalPages={pagination.totalPages}
                    totalItems={pagination.total}
                    itemsPerPage={pagination.limit}
                    onPageChange={onPageChange}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {!onAlumniClick && selectedAlumniDetail && (
        <AlumniProfileModal
          alumni={selectedAlumniDetail}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}

      <Drawer.Root
        open={mobileFiltersOpen}
        onOpenChange={onMobileFiltersOpenChange}
        direction="bottom"
        modal
        dismissible
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[10000] bg-black/40 md:hidden" />
          <Drawer.Content
            style={mobileDrawerStyle}
            className="fixed bottom-0 left-0 right-0 z-[10001] flex max-h-[88dvh] min-h-0 flex-col rounded-t-[20px] border border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none md:hidden"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-zinc-300" aria-hidden />
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
              <Drawer.Title className="text-lg font-semibold text-gray-900">Filters</Drawer.Title>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                onClick={() => onMobileFiltersOpenChange(false)}
                aria-label="Close filters"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Drawer.Description className="sr-only">
              Search and filter the alumni directory. Changes apply as you adjust each field.
            </Drawer.Description>
            <div ref={selectDropdownPortalRef} className="relative flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
                <AlumniFilterBar
                  filters={filters}
                  onFiltersChange={onFiltersChange}
                  onClearFilters={onClearFilters}
                  isSidebar
                  industrySelectPortalContainerRef={selectDropdownPortalRef}
                />
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
