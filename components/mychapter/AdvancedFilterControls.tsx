"use client";

import { useState } from "react";
import {
  MapPin,
  GraduationCap,
  Briefcase,
  Shield,
  Save,
  Star,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MemberSearchFilters, FilterPreset, AvailableFilterOptions } from "@/types/memberFilters";

interface AdvancedFilterControlsProps {
  filters: MemberSearchFilters;
  onFiltersChange: (updates: Partial<MemberSearchFilters>) => void;
  availableOptions: AvailableFilterOptions;
  advancedFilterCount: number;
  presets: FilterPreset[];
  onSavePreset: (name: string) => FilterPreset;
  onApplyPreset: (preset: FilterPreset) => void;
  onRenamePreset: (id: string, name: string) => void;
  onDeletePreset: (id: string) => void;
  compact?: boolean;
}

function FilterSelect({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string | null;
  options: { value: string; label: string; count: number }[];
  onChange: (value: string | null) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-2.5 pr-8 text-sm text-gray-900 focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label} ({opt.count})
          </option>
        ))}
      </select>
    </div>
  );
}

export function AdvancedFilterControls({
  filters,
  onFiltersChange,
  availableOptions,
  advancedFilterCount,
  presets,
  onSavePreset,
  onApplyPreset,
  onRenamePreset,
  onDeletePreset,
  compact = false,
}: AdvancedFilterControlsProps) {
  const [expanded, setExpanded] = useState(advancedFilterCount > 0);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    onSavePreset(name);
    setPresetName("");
    setSavingPreset(false);
  };

  const handleStartRename = (preset: FilterPreset) => {
    setRenamingId(preset.id);
    setRenameValue(preset.name);
  };

  const handleConfirmRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenamePreset(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const hasAnyOption =
    availableOptions.graduationYears.length > 0 ||
    availableOptions.majors.length > 0 ||
    availableOptions.locations.length > 0 ||
    availableOptions.chapterRoles.length > 0;

  if (!hasAnyOption && presets.length === 0) return null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          Advanced Filters
          {advancedFilterCount > 0 && (
            <Badge
              variant="secondary"
              className="h-5 min-w-5 rounded-full px-1.5 text-[10px] font-medium tabular-nums bg-brand-primary/10 text-brand-primary"
            >
              {advancedFilterCount}
            </Badge>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className={cn("space-y-4", compact ? "space-y-3" : "space-y-4")}>
          <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1")}>
            {availableOptions.graduationYears.length > 0 && (
              <FilterSelect
                label="Graduation Year"
                icon={GraduationCap}
                value={filters.graduationYear}
                options={availableOptions.graduationYears}
                onChange={(v) => onFiltersChange({ graduationYear: v })}
                placeholder="All years"
              />
            )}
            {availableOptions.majors.length > 0 && (
              <FilterSelect
                label="Major"
                icon={Briefcase}
                value={filters.major}
                options={availableOptions.majors}
                onChange={(v) => onFiltersChange({ major: v })}
                placeholder="All majors"
              />
            )}
            {availableOptions.locations.length > 0 && (
              <FilterSelect
                label="Location"
                icon={MapPin}
                value={filters.location}
                options={availableOptions.locations}
                onChange={(v) => onFiltersChange({ location: v })}
                placeholder="All locations"
              />
            )}
            {availableOptions.chapterRoles.length > 0 && (
              <FilterSelect
                label="Chapter Role"
                icon={Shield}
                value={filters.chapterRole}
                options={availableOptions.chapterRoles}
                onChange={(v) => onFiltersChange({ chapterRole: v as MemberSearchFilters["chapterRole"] })}
                placeholder="All roles"
              />
            )}
          </div>

          {advancedFilterCount > 0 && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-gray-500 hover:text-gray-700"
                onClick={() =>
                  onFiltersChange({
                    graduationYear: null,
                    major: null,
                    location: null,
                    chapterRole: null,
                  })
                }
              >
                Clear advanced filters
              </Button>
              {!savingPreset && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-brand-primary hover:text-brand-primary/80"
                  onClick={() => setSavingPreset(true)}
                >
                  <Save className="h-3 w-3" />
                  Save as preset
                </Button>
              )}
            </div>
          )}

          {savingPreset && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
              <input
                type="text"
                autoFocus
                placeholder="Preset name…"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSavePreset();
                  if (e.key === "Escape") setSavingPreset(false);
                }}
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                onClick={() => {
                  setSavingPreset(false);
                  setPresetName("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {presets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Saved Presets</p>
              <div className="space-y-1">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="group flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 hover:border-gray-300 transition-colors"
                  >
                    {renamingId === preset.id ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleConfirmRename();
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-green-600"
                          onClick={handleConfirmRename}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-gray-400"
                          onClick={() => setRenamingId(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-xs font-medium text-gray-700 hover:text-gray-900"
                          onClick={() => onApplyPreset(preset)}
                        >
                          <Star className="mr-1 inline-block h-3 w-3 text-amber-400" />
                          {preset.name}
                        </button>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-gray-400 hover:text-gray-600"
                            onClick={() => handleStartRename(preset)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-gray-400 hover:text-red-500"
                            onClick={() => onDeletePreset(preset.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
