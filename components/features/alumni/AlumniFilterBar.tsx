import type { RefObject } from "react";
import { Search, X, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectItem } from "@/components/ui/select";
import {
  graduationYears,
  alumniDirectoryIndustryFilterOptions,
  getEarlierCutoffYear,
} from "@/lib/alumniConstants";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { US_STATES, getStateNameByCode } from "@/lib/usStates";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FilterState {
  searchTerm: string;
  graduationYear: string;
  industry: string;
  state: string;
  activelyHiring: boolean;
}

interface AlumniFilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearFilters: () => void;
  isSidebar?: boolean;
  /** When set (e.g. mobile filters drawer), Industry SearchableSelect portals into this host for iOS keyboard behavior. */
  industrySelectPortalContainerRef?: RefObject<HTMLElement | null>;
}

export function AlumniFilterBar({
  filters,
  onFiltersChange,
  onClearFilters,
  isSidebar = false,
  industrySelectPortalContainerRef,
}: AlumniFilterBarProps) {
  const handleFilterChange = (key: keyof FilterState, value: string | boolean) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => 
    typeof value === 'boolean' ? value : value !== ""
  );
  const activeFilterCount = Object.values(filters).filter(v => 
    typeof v === 'boolean' ? v : v !== ""
  ).length;

  if (isSidebar) {
    // Sidebar layout
    return (
      <div className="space-y-6">
        {/* Search Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search alumni..."
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
              className="pl-10 bg-white border-gray-300 focus:border-brand-primary focus:ring-brand-primary"
            />
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Filters</label>
          <div className="flex flex-col space-y-2">
            <Button
              variant={filters.activelyHiring ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilterChange('activelyHiring', !filters.activelyHiring)}
              className="justify-start"
            >
              <Building2 className="h-4 w-4 mr-2" />
              Actively Hiring
            </Button>
          </div>
        </div>
        
        {/* Graduation Year Filter — native <select> below md (iOS filters drawer); custom Select on desktop sidebar */}
        <div className="space-y-2">
          <label htmlFor="alumni-filter-grad-year" className="text-sm font-medium text-gray-700">
            Graduation Year
          </label>
          <select
            id="alumni-filter-grad-year"
            className={cn(
              "md:hidden flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm",
              "focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            )}
            value={filters.graduationYear}
            onChange={(e) => handleFilterChange("graduationYear", e.target.value)}
          >
            <option value="">All Years</option>
            {graduationYears.map((year) => (
              <option key={year} value={year.toString()}>
                {year}
              </option>
            ))}
            <option value="older">{getEarlierCutoffYear()} & Earlier</option>
          </select>
          <div className="hidden md:block">
            <Select
              value={filters.graduationYear}
              onValueChange={(value) => handleFilterChange("graduationYear", value)}
            >
              <SelectItem value="">All Years</SelectItem>
              {graduationYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
              <SelectItem value="older">{getEarlierCutoffYear()} & Earlier</SelectItem>
            </Select>
          </div>
        </div>

        {/* Industry Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Industry</label>
          <SearchableSelect
            value={filters.industry}
            onValueChange={(value) => handleFilterChange('industry', value)}
            options={alumniDirectoryIndustryFilterOptions}
            placeholder="All Industries"
            searchPlaceholder="Search industries..."
            allowCustom
            portalContainerRef={industrySelectPortalContainerRef}
          />
        </div>

        {/* State Filter — native <select> below md (iOS); custom Select md+ */}
        <div className="space-y-2">
          <label htmlFor="alumni-filter-state" className="text-sm font-medium text-gray-700">
            State
          </label>
          <select
            id="alumni-filter-state"
            className={cn(
              "md:hidden flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm",
              "focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            )}
            value={filters.state}
            onChange={(e) => handleFilterChange("state", e.target.value)}
          >
            <option value="">All States</option>
            {US_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
          <div className="hidden md:block w-full">
            <Select
              value={filters.state}
              onValueChange={(value) => handleFilterChange("state", value)}
              placeholder="All States"
              className="w-full"
            >
              <SelectItem value="">All States</SelectItem>
              {US_STATES.map((state) => (
                <SelectItem key={state.code} value={state.code}>
                  {state.name}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant="outline"
            onClick={onClearFilters}
            className="w-full text-gray-600"
          >
            <X className="h-4 w-4 mr-2" />
            Clear All Filters
          </Button>
        )}

        {/* Active Filter Tags */}
        {hasActiveFilters && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <span className="text-xs text-gray-500">
              Active filters ({activeFilterCount}):
            </span>
            <div className="flex flex-wrap gap-2">
              {filters.state && (
                <Badge variant="outline" className="text-xs bg-primary-50 border-primary-200 text-brand-primary-hover">
                  State: {getStateNameByCode(filters.state) || filters.state}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer hover:text-primary-900" 
                    onClick={() => handleFilterChange('state', '')}
                  />
                </Badge>
              )}
              {filters.graduationYear && (
                <Badge variant="outline" className="text-xs bg-primary-50 border-primary-200 text-brand-primary-hover">
                  Year: {filters.graduationYear}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer hover:text-primary-900" 
                    onClick={() => handleFilterChange('graduationYear', '')}
                  />
                </Badge>
              )}
              {filters.industry && (
                <Badge variant="outline" className="text-xs bg-primary-50 border-primary-200 text-brand-primary-hover">
                  Industry: {filters.industry}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer hover:text-primary-900" 
                    onClick={() => handleFilterChange('industry', '')}
                  />
                </Badge>
              )}
              {filters.activelyHiring && (
                <Badge variant="outline" className="text-xs bg-primary-50 border-primary-200 text-brand-primary-hover">
                  Actively Hiring
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer hover:text-primary-900" 
                    onClick={() => handleFilterChange('activelyHiring', false)}
                  />
                </Badge>
              )}
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  // Original horizontal layout
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto">
        {/* Main Search and Filter Row */}
        <div className="flex items-center space-x-4 mb-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search"
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
              className="pl-10 bg-white border-gray-300 focus:border-brand-primary focus:ring-brand-primary"
            />
          </div>
          
          {/* Filter Dropdowns */}
          <div className="flex items-center space-x-3">
            {/* Filter Buttons */}
            <Button
              variant={filters.activelyHiring ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilterChange('activelyHiring', !filters.activelyHiring)}
              className="flex items-center space-x-2"
            >
              <Building2 className="h-4 w-4" />
              <span>Actively Hiring</span>
            </Button>


            {/* State Filter */}
            <div className="relative">
              <Select 
                value={filters.state} 
                onValueChange={(value) => handleFilterChange('state', value)}
                placeholder="All States"
                className="w-32"
              >
                <SelectItem value="">All States</SelectItem>
                {US_STATES.map((state) => (
                  <SelectItem key={state.code} value={state.code}>
                    {state.name}
                  </SelectItem>
                ))}
              </Select>
            </div>

            {/* Graduation Year Filter */}
            <div className="relative">
              <Select 
                value={filters.graduationYear} 
                onValueChange={(value) => handleFilterChange('graduationYear', value)}
                placeholder="Grad. Year"
                className="w-32"
              >
                <SelectItem value="">All Years</SelectItem>
                {graduationYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
                <SelectItem value="older">{getEarlierCutoffYear()} & Earlier</SelectItem>
              </Select>
            </div>

            {/* Industry Filter */}
            <div className="relative w-36 min-w-[9rem]">
              <SearchableSelect
                value={filters.industry}
                onValueChange={(value) => handleFilterChange('industry', value)}
                options={alumniDirectoryIndustryFilterOptions}
                placeholder="All Industries"
                searchPlaceholder="Search industries..."
                className="w-full"
                allowCustom
              />
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="text-gray-500 hover:text-gray-700 h-9"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Active Filter Tags */}
        {hasActiveFilters && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2 pt-2 border-t border-gray-100"
          >
            <span className="text-xs text-gray-500 mr-2">
              Active filters ({activeFilterCount}):
            </span>
            {filters.state && (
              <Badge variant="outline" className="text-xs bg-primary-50 border-primary-200 text-brand-primary-hover">
                State: {getStateNameByCode(filters.state) || filters.state}
                <X 
                  className="h-3 w-3 ml-1 cursor-pointer hover:text-primary-900" 
                  onClick={() => handleFilterChange('state', '')}
                />
              </Badge>
            )}
            {filters.graduationYear && (
              <Badge variant="outline" className="text-xs bg-primary-50 border-primary-200 text-brand-primary-hover">
                Year: {filters.graduationYear}
                <X 
                  className="h-3 w-3 ml-1 cursor-pointer hover:text-primary-900" 
                  onClick={() => handleFilterChange('graduationYear', '')}
                />
              </Badge>
            )}
            {filters.industry && (
              <Badge variant="outline" className="text-xs bg-primary-50 border-primary-200 text-brand-primary-hover">
                Industry: {filters.industry}
                <X 
                  className="h-3 w-3 ml-1 cursor-pointer hover:text-primary-900" 
                  onClick={() => handleFilterChange('industry', '')}
                />
              </Badge>
            )}
            {filters.activelyHiring && (
              <Badge variant="outline" className="text-xs bg-primary-50 border-primary-200 text-brand-primary-hover">
                Actively Hiring
                <X 
                  className="h-3 w-3 ml-1 cursor-pointer hover:text-primary-900" 
                  onClick={() => handleFilterChange('activelyHiring', false)}
                />
              </Badge>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
} 