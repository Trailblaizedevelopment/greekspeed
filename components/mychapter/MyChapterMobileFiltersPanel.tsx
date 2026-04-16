"use client";

import { Users, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface MyChapterMemberStats {
  total: number;
  general: number;
  officers: number;
}

interface MyChapterMobileFiltersPanelProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onClearFilters: () => void;
  stats: MyChapterMemberStats;
  statsLoading?: boolean;
}

const sections = [
  {
    id: "all",
    label: "All members",
    description: "Officers and general members",
    icon: Users,
    countKey: "total" as const,
  },
  {
    id: "members",
    label: "General members",
    description: "Active chapter members",
    icon: Users,
    countKey: "general" as const,
  },
  {
    id: "officers",
    label: "Officers & leadership",
    description: "Chapter leadership team",
    icon: GraduationCap,
    countKey: "officers" as const,
  },
];

export function MyChapterMobileFiltersPanel({
  searchTerm,
  onSearchChange,
  activeSection,
  onSectionChange,
  onClearFilters,
  stats,
  statsLoading,
}: MyChapterMobileFiltersPanelProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="chapter-member-search" className="text-sm font-medium text-gray-700">
          Search members
        </label>
        <div className="relative">
          <input
            id="chapter-member-search"
            type="search"
            placeholder="Name, major, or bio…"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-3 pr-3 text-sm focus:border-brand-primary focus:ring-brand-primary"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Show</p>
        <div className="flex flex-col gap-2">
          {sections.map((item) => {
            const Icon = item.icon;
            const count = stats[item.countKey];
            const selected = activeSection === item.id;
            return (
              <Button
                key={item.id}
                type="button"
                variant={selected ? "default" : "outline"}
                className={cn(
                  "h-auto min-h-[3.25rem] w-full justify-start rounded-xl px-3 py-2.5 text-left",
                  selected ? "border-2 border-black bg-slate-100 text-gray-900" : "border-gray-200"
                )}
                onClick={() => onSectionChange(item.id)}
              >
                <div className="flex w-full items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-gray-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900">{item.label}</span>
                      <Badge variant="secondary" className="shrink-0 text-xs tabular-nums">
                        {statsLoading ? "—" : count}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      <Button type="button" variant="ghost" className="w-full text-gray-600" onClick={onClearFilters}>
        Clear search & reset view
      </Button>
    </div>
  );
}
