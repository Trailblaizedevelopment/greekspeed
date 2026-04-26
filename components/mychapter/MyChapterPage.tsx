"use client";

import { MyChapterSidebar } from "./MyChapterSidebar";
import { MyChapterContent } from "./MyChapterContent";
import { useChapterMembers } from "@/lib/hooks/useChapterMembers";
import { useScopedChapterId } from "@/lib/hooks/useScopedChapterId";
import { useMemberFilters } from "@/lib/hooks/useMemberFilters";

export function MyChapterPage() {
  const chapterId = useScopedChapterId();
  const { members } = useChapterMembers(chapterId || undefined, true);

  const {
    filters,
    setFilters,
    clearFilters,
    availableOptions,
    advancedFilterCount,
    totalFilterCount,
    presets,
    savePreset,
    applyPreset,
    renamePreset,
    deletePreset,
  } = useMemberFilters(members);

  const handleNavigate = (section: string) => {
    setFilters({ section });
  };

  return (
    <div className="flex min-h-[100dvh] bg-gray-50 md:flex-row">
      <MyChapterSidebar
        onNavigate={handleNavigate}
        activeSection={filters.section}
        searchTerm={filters.searchTerm}
        onSearchChange={(term) => setFilters({ searchTerm: term })}
        filters={filters}
        onFiltersChange={setFilters}
        availableOptions={availableOptions}
        advancedFilterCount={advancedFilterCount}
        presets={presets}
        onSavePreset={savePreset}
        onApplyPreset={applyPreset}
        onRenamePreset={renamePreset}
        onDeletePreset={deletePreset}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <MyChapterContent
          onNavigate={handleNavigate}
          activeSection={filters.section}
          searchTerm={filters.searchTerm}
          onSearchChange={(term) => setFilters({ searchTerm: term })}
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={clearFilters}
          availableOptions={availableOptions}
          advancedFilterCount={advancedFilterCount}
          totalFilterCount={totalFilterCount}
          presets={presets}
          onSavePreset={savePreset}
          onApplyPreset={applyPreset}
          onRenamePreset={renamePreset}
          onDeletePreset={deletePreset}
        />
      </div>
    </div>
  );
}
