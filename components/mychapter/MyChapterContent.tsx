"use client";

import { useState, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";
import { Filter, X, Search, SlidersHorizontal } from "lucide-react";
import { LinkedInStyleChapterCard } from "./LinkedInStyleChapterCard";
import { ChapterCardSkeletonGrid } from "./ChapterCardSkeleton";
import { MyChapterMobileFiltersPanel } from "./MyChapterMobileFiltersPanel";
import { ChapterMember } from "@/types/chapter";
import { useChapterMembers } from "@/lib/hooks/useChapterMembers";
import { useScopedChapterId } from "@/lib/hooks/useScopedChapterId";
import { useProfile } from "@/lib/contexts/ProfileContext";
import { getRoleDisplayName } from "@/lib/permissions";
import { useProfileModal } from "@/lib/contexts/ProfileModalContext";
import {
  calculateChapterMemberCompleteness,
  sortChapterMembersByCompleteness,
} from "@/lib/utils/profileCompleteness";
import { useAlumniPipelineMobileHosts } from "@/lib/contexts/AlumniPipelineMobileHostsContext";
import { useVisualViewportHeight } from "@/lib/hooks/useVisualViewportHeight";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MemberSearchFilters, FilterPreset, AvailableFilterOptions } from "@/types/memberFilters";
import type { ChapterRole } from "@/types/profile";

interface MyChapterContentProps {
  onNavigate: (section: string) => void;
  activeSection: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filters: MemberSearchFilters;
  onFiltersChange: (updates: Partial<MemberSearchFilters>) => void;
  onClearFilters: () => void;
  availableOptions: AvailableFilterOptions;
  advancedFilterCount: number;
  totalFilterCount: number;
  presets: FilterPreset[];
  onSavePreset: (name: string) => FilterPreset;
  onApplyPreset: (preset: FilterPreset) => void;
  onRenamePreset: (id: string, name: string) => void;
  onDeletePreset: (id: string) => void;
}

interface TransformedMemberWithRawData extends ChapterMember {
  _gradYear?: number;
  _location?: string;
  _chapterRole?: string;
}

export function MyChapterContent({
  onNavigate,
  activeSection,
  searchTerm,
  onSearchChange,
  filters,
  onFiltersChange,
  onClearFilters,
  availableOptions,
  advancedFilterCount,
  totalFilterCount,
  presets,
  onSavePreset,
  onApplyPreset,
  onRenamePreset,
  onDeletePreset,
}: MyChapterContentProps) {
  const { loading: profileLoading } = useProfile();
  const { openUserProfile } = useProfileModal();
  const chapterId = useScopedChapterId();

  const { members, loading: membersLoading } = useChapterMembers(chapterId || undefined, true);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const mobileHosts = useAlumniPipelineMobileHosts();
  const isEmbeddedInDashboard = mobileHosts !== undefined;

  const { height: visualHeight, offsetTop: vvOffsetTop } = useVisualViewportHeight();
  const [fullInnerHeight, setFullInnerHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 768
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsNarrowViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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

  const isLoading = profileLoading || membersLoading;

  const transformedMembers: TransformedMemberWithRawData[] = members.map((member) => {
    const memberDescription =
      member.bio && member.bio !== "null" && member.bio.trim() !== ""
        ? member.bio
        : "Chapter Member";

    return {
      id: member.id,
      name:
        member.full_name ||
        `${member.first_name || ""} ${member.last_name || ""}`.trim() ||
        "Unknown Member",
      year: member.grad_year ? member.grad_year.toString() : undefined,
      major: member.major && member.major !== "null" ? member.major : undefined,
      position:
        member.chapter_role && member.chapter_role !== "member"
          ? getRoleDisplayName(member.chapter_role as ChapterRole)
          : undefined,
      avatar: member.avatar_url || undefined,
      verified: member.role === "admin",
      mutualConnections: (member as { mutualConnections?: ChapterMember["mutualConnections"] })
        .mutualConnections || [],
      mutualConnectionsCount:
        (member as { mutualConnectionsCount?: number }).mutualConnectionsCount || 0,
      description: memberDescription,
      _gradYear: member.grad_year,
      _location: member.location?.trim() || member.hometown?.trim() || undefined,
      _chapterRole: member.chapter_role && member.chapter_role !== "member" ? member.chapter_role : undefined,
    };
  });

  const filteredMembers = useMemo(() => {
    return transformedMembers.filter((member) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          member.name.toLowerCase().includes(term) ||
          member.major?.toLowerCase().includes(term) ||
          (member.description && member.description.toLowerCase().includes(term));
        if (!matchesSearch) return false;
      }

      if (filters.graduationYear && member._gradYear !== Number(filters.graduationYear)) {
        return false;
      }

      if (filters.major && member.major !== filters.major) {
        return false;
      }

      if (filters.location) {
        const loc = member._location || "";
        if (loc !== filters.location) return false;
      }

      if (filters.chapterRole && member._chapterRole !== filters.chapterRole) {
        return false;
      }

      return true;
    });
  }, [transformedMembers, searchTerm, filters.graduationYear, filters.major, filters.location, filters.chapterRole]);

  const leadershipTitles = [
    "President",
    "Vice President",
    "Treasurer",
    "Secretary",
    "Rush Chair",
    "Social Chair",
  ];
  const officers = filteredMembers.filter(
    (member) =>
      member.verified ||
      (member.position && leadershipTitles.includes(member.position))
  );

  const positionPriority: Record<string, number> = {
    President: 1,
    "Vice President": 2,
    Treasurer: 3,
    "Social Chair": 4,
    Secretary: 5,
    "Rush Chair": 6,
  };
  const sortedOfficers = [...officers].sort((a, b) => {
    const aPriority = positionPriority[a.position || ""] || 999;
    const bPriority = positionPriority[b.position || ""] || 999;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    const aScore = calculateChapterMemberCompleteness(a);
    const bScore = calculateChapterMemberCompleteness(b);
    if (aScore !== bScore) return bScore - aScore;

    const aHasAvatar = a.avatar ? 1 : 0;
    const bHasAvatar = b.avatar ? 1 : 0;
    if (aHasAvatar !== bHasAvatar) return bHasAvatar - aHasAvatar;

    if (a.mutualConnectionsCount !== b.mutualConnectionsCount) {
      return b.mutualConnectionsCount - a.mutualConnectionsCount;
    }

    return a.name.localeCompare(b.name);
  });

  const generalMembers = sortChapterMembersByCompleteness(
    filteredMembers.filter(
      (member) =>
        !(member.verified || (member.position && leadershipTitles.includes(member.position)))
    )
  );

  const getFilteredMembers = () => {
    switch (activeSection) {
      case "all":
        return filteredMembers;
      case "members":
        return generalMembers;
      case "officers":
        return sortedOfficers;
      default:
        return filteredMembers;
    }
  };

  const displayMembers = getFilteredMembers();

  const memberStatsForFilters = useMemo(() => {
    const officersFromApi = members.filter(
      (m) => m.chapter_role && m.chapter_role !== "member" && m.chapter_role !== "pledge"
    ).length;
    return {
      total: members.length,
      general: Math.max(0, members.length - officersFromApi),
      officers: officersFromApi,
    };
  }, [members]);

  const mobileCountSubtitle = useMemo(() => {
    if (activeSection === "officers") {
      return `${sortedOfficers.length} officer${sortedOfficers.length === 1 ? "" : "s"}`;
    }
    if (activeSection === "members") {
      return `${generalMembers.length} member${generalMembers.length === 1 ? "" : "s"}`;
    }
    return `${filteredMembers.length} member${filteredMembers.length === 1 ? "" : "s"}`;
  }, [activeSection, sortedOfficers.length, generalMembers.length, filteredMembers.length]);

  const activeFilterCount = useMemo(() => {
    return totalFilterCount;
  }, [totalFilterCount]);

  const h = mobileHosts;
  const canPortalDashboardMobile =
    isEmbeddedInDashboard &&
    isNarrowViewport &&
    !!h?.countLine &&
    !!h?.actions;

  const compactToolbarBtn =
    "h-7 rounded-full px-2.5 text-xs font-medium transition-all duration-200 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-300 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900";

  const dashboardMobilePortals =
    canPortalDashboardMobile && h ? (
      <>
        {createPortal(
          <p className="truncate text-xs text-gray-500">{mobileCountSubtitle}</p>,
          h.countLine!
        )}
        {createPortal(
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMobileFiltersOpen(true)}
            className={cn("shrink-0 gap-1 px-2.5", compactToolbarBtn)}
          >
            <Filter className="h-3 w-3 shrink-0 text-brand-primary" />
            <span>Filters</span>
            {activeFilterCount > 0 ? (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 rounded-full px-1.5 text-[10px] font-medium tabular-nums"
              >
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>,
          h.actions!
        )}
      </>
    ) : null;

  const standaloneMobileToolbar =
    !isEmbeddedInDashboard && isNarrowViewport ? (
      <div className="sticky top-0 z-[5] flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 md:hidden">
        <p className="min-w-0 flex-1 truncate text-xs text-gray-600">{mobileCountSubtitle}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMobileFiltersOpen(true)}
          className={cn("shrink-0 gap-1 px-2.5", compactToolbarBtn)}
        >
          <Filter className="h-3 w-3 shrink-0 text-brand-primary" />
          <span>Filters</span>
          {activeFilterCount > 0 ? (
            <Badge
              variant="secondary"
              className="h-5 min-w-5 rounded-full px-1.5 text-[10px] font-medium tabular-nums"
            >
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
      </div>
    ) : null;

  const handleClearMobileFilters = () => {
    onClearFilters();
    setMobileFiltersOpen(false);
  };

  const filterDrawer = (
    <Drawer.Root
      open={mobileFiltersOpen}
      onOpenChange={setMobileFiltersOpen}
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
              onClick={() => setMobileFiltersOpen(false)}
              aria-label="Close filters"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Drawer.Description className="sr-only">
            Search and filter chapter members by name, graduation year, major, location, and role.
          </Drawer.Description>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
            <MyChapterMobileFiltersPanel
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
              activeSection={activeSection}
              onSectionChange={(id) => {
                onNavigate(id);
                setMobileFiltersOpen(false);
              }}
              onClearFilters={handleClearMobileFilters}
              stats={memberStatsForFilters}
              statsLoading={membersLoading}
              filters={filters}
              onFiltersChange={onFiltersChange}
              availableOptions={availableOptions}
              advancedFilterCount={advancedFilterCount}
              presets={presets}
              onSavePreset={onSavePreset}
              onApplyPreset={onApplyPreset}
              onRenamePreset={onRenamePreset}
              onDeletePreset={onDeletePreset}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );

  if (isLoading) {
    return (
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 py-3 sm:py-6">
          <ChapterCardSkeletonGrid count={8} />
        </div>
      </div>
    );
  }

  const scrollPaddingClass =
    "pb-[calc(120px+env(safe-area-inset-bottom))] sm:pb-6 md:pb-6";

  const hasActiveFilters = totalFilterCount > 0;

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        {hasActiveFilters ? (
          <SlidersHorizontal className="h-7 w-7 text-gray-400" />
        ) : (
          <Search className="h-7 w-7 text-gray-400" />
        )}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {hasActiveFilters ? "No members match your filters" : "No members found"}
      </h3>
      <p className="max-w-sm text-sm text-gray-500 mb-6">
        {hasActiveFilters
          ? "Try broadening your search by removing some filters, or save your current filter set as a preset for later."
          : "There are no chapter members to display yet. Members will appear here once they join."}
      </p>
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => onClearFilters()}
          >
            Clear all filters
          </Button>
          {advancedFilterCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full text-gray-500"
              onClick={() =>
                onFiltersChange({
                  graduationYear: null,
                  major: null,
                  location: null,
                  chapterRole: null,
                })
              }
            >
              Clear advanced filters only
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (activeSection === "all") {
    return (
      <>
        {dashboardMobilePortals}
        {filterDrawer}
        <div className="flex-1 bg-gray-50 overflow-y-auto">
          {standaloneMobileToolbar}
          <div className={cn("max-w-7xl mx-auto px-2 sm:px-6 py-2 sm:py-6", scrollPaddingClass)}>
            {sortedOfficers.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center space-x-2 mb-4">
                  <h2 className="text-lg font-medium text-gray-900">Officers & Leadership</h2>
                  <span className="text-sm text-gray-500">({sortedOfficers.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1 sm:gap-2 md:gap-3 items-start">
                  {sortedOfficers.map((member) => (
                    <LinkedInStyleChapterCard
                      key={member.id}
                      member={member}
                      onClick={() => openUserProfile(member.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {generalMembers.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <h2 className="text-lg font-medium text-gray-900">General Members</h2>
                  <span className="text-sm text-gray-500">({generalMembers.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1 sm:gap-2 md:gap-3 items-start">
                  {generalMembers.map((member) => (
                    <LinkedInStyleChapterCard
                      key={member.id}
                      member={member}
                      onClick={() => openUserProfile(member.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredMembers.length === 0 && !isLoading && emptyState}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {dashboardMobilePortals}
      {filterDrawer}
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        {standaloneMobileToolbar}
        <div className={cn("max-w-7xl mx-auto px-2 sm:px-6 py-2 sm:py-6", scrollPaddingClass)}>
          {displayMembers.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1 sm:gap-2 md:gap-3 items-start">
              {displayMembers.map((member) => (
                <LinkedInStyleChapterCard
                  key={member.id}
                  member={member}
                  onClick={() => openUserProfile(member.id)}
                />
              ))}
            </div>
          ) : (
            emptyState
          )}
        </div>
      </div>
    </>
  );
}
