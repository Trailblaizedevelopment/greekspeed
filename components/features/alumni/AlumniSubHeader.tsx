"use client";

import Link from "next/link";
import { Download, Filter, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { cn } from "@/lib/utils";

interface AlumniSubHeaderProps {
  viewMode: 'table' | 'card';
  onViewModeChange: (mode: 'table' | 'card') => void;
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onExport: () => void;
  /** When false, the Export All control is hidden (e.g. developers only). */
  canExportAlumni: boolean;
  /** Mobile (below `sm`): opens filter drawer when set. */
  onOpenMobileFilters?: () => void;
  /** Badge count for active alumni filters (mobile). */
  activeFilterCount?: number;
  userChapter?: string | null;
  profileCompletionPercentage?: number | null;
}

const exportButtonStyles =
  "h-8 rounded-full px-3 sm:px-4 text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-300 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900";

export function AlumniSubHeader({
  viewMode,
  onViewModeChange,
  selectedCount,
  totalCount,
  onExport,
  canExportAlumni,
  onOpenMobileFilters,
  activeFilterCount = 0,
  onClearSelection: _onClearSelection,
  profileCompletionPercentage,
}: AlumniSubHeaderProps) {
  // Only show "X selected" when in table view (selection is relevant there)
  const countText =
    viewMode === "table"
      ? `${totalCount} alumni • ${selectedCount} selected`
      : `${totalCount} alumni`;
  const mobileCountText =
    viewMode === "table"
      ? `${totalCount} alumni found • ${selectedCount} selected`
      : `${totalCount} alumni found`;

  const showProfilePill =
    profileCompletionPercentage != null && profileCompletionPercentage < 80;

  const profilePill = showProfilePill ? (
    <Link
      href="/dashboard/profile"
      className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100 hover:text-sky-900 flex-shrink-0 sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-sm"
    >
      <UserCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
      <span>Complete your profile ({profileCompletionPercentage}%)</span>
    </Link>
  ) : null;

  return (
    <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
      {/* Mobile Layout: Row 1 = count + actions (Export / Filters); Row 2 = profile pill */}
      <div className="sm:hidden flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className="text-gray-600 text-xs min-w-0 flex-1 truncate pr-1">{mobileCountText}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            {canExportAlumni ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onExport}
                className={cn("h-7 shrink-0 px-2.5 text-xs", exportButtonStyles)}
              >
                <Download className="h-3 w-3 mr-1 shrink-0" />
                Export All
              </Button>
            ) : null}
            {onOpenMobileFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenMobileFilters}
                className={cn("h-7 shrink-0 gap-1 px-2.5 text-xs", exportButtonStyles)}
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
            ) : null}
          </div>
        </div>
        {profilePill && (
          <div className="flex justify-start">
            {profilePill}
          </div>
        )}
      </div>

      {/* Desktop Layout */}
      <div className="hidden sm:flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-gray-600 text-sm flex-shrink-0">{countText}</p>
          {profilePill}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {canExportAlumni ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className={exportButtonStyles}
            >
              <Download className="h-4 w-4 mr-2" />
              Export All
            </Button>
          ) : null}
          <ViewToggle viewMode={viewMode} onViewChange={onViewModeChange} />
        </div>
      </div>
    </div>
  );
} 