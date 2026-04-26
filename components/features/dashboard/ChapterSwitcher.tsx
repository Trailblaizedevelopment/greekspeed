'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useAuth } from '@/lib/supabase/auth-context';

interface Chapter {
  id: string;
  name: string;
  school?: string;
  location?: string;
  is_primary?: boolean;
}

export function ChapterSwitcher() {
  const { profile, isDeveloper } = useProfile();
  const { session } = useAuth();
  const {
    activeChapterId,
    setActiveChapterId,
    hasMultipleMemberships,
    setHasMultipleMemberships,
    setMemberSpaces,
  } = useActiveChapter();

  const [isOpen, setIsOpen] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isGovernance = profile?.role === 'governance';
  const showSwitcher = isDeveloper || isGovernance || hasMultipleMemberships;

  useEffect(() => {
    setMounted(true);
  }, []);

  // TRA-661: Fetch member spaces for regular users to detect multi-membership
  useEffect(() => {
    if (isDeveloper || isGovernance || !session?.access_token) return;

    const fetchMemberSpaces = async () => {
      try {
        const response = await fetch('/api/me/member-spaces', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data.has_multiple) {
          setHasMultipleMemberships(true);
          const raw = data.spaces || [];
          setChapters(
            raw.map((s: { id: string; name: string; school?: string; is_primary?: boolean }) => ({
              id: s.id,
              name: s.name,
              school: s.school,
              is_primary: s.is_primary,
            }))
          );
          setMemberSpaces(raw.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
        } else {
          setMemberSpaces([]);
        }
      } catch (error) {
        console.error('ChapterSwitcher: Error fetching member spaces:', error);
      }
    };

    fetchMemberSpaces();
  }, [isDeveloper, isGovernance, session?.access_token, setHasMultipleMemberships, setMemberSpaces]);

  // Fetch chapters for developer/governance (unchanged existing behavior)
  useEffect(() => {
    if (!showSwitcher || !session?.access_token) return;
    if (hasMultipleMemberships && !isDeveloper && !isGovernance) return;

    const fetchChapters = async () => {
      try {
        setLoading(true);
        if (isGovernance) {
          const response = await fetch('/api/me/governance-chapters', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (!response.ok) throw new Error('Failed to fetch governance chapters');
          const data = await response.json();
          const list = data.chapters || [];
          setChapters(list);
          setMemberSpaces(
            list.map((c: { id: string; name: string }) => ({
              id: c.id,
              name: c.name,
            }))
          );
        } else if (isDeveloper) {
          const response = await fetch('/api/developer/chapters?page=1&limit=100', {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          if (!response.ok) throw new Error('Failed to fetch chapters');
          const data = await response.json();
          const list = data.chapters || [];
          setChapters(list);
          setMemberSpaces(
            list.map((c: { id: string; name: string }) => ({
              id: c.id,
              name: c.name,
            }))
          );
        }
      } catch (error) {
        console.error('ChapterSwitcher: Error fetching chapters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChapters();
  }, [showSwitcher, isGovernance, isDeveloper, hasMultipleMemberships, session?.access_token, setMemberSpaces]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSelect = useCallback((chapterId: string | null) => {
    setActiveChapterId(chapterId);
    setIsOpen(false);
    setSearchQuery('');

    // TRA-661: Persist last-selected space in localStorage
    if (profile?.id && chapterId) {
      try {
        localStorage.setItem(`tb:last-active-space:${profile.id}`, chapterId);
      } catch {
        // localStorage unavailable
      }
    }
  }, [setActiveChapterId, profile?.id]);

  // Early return AFTER all hooks
  if (!showSwitcher) return null;

  // For governance / multi-member: show user's active (home) chapter first, then others
  const orderedChapters =
    (isGovernance || hasMultipleMemberships) && profile?.chapter_id
      ? [
          ...chapters.filter((c) => c.id === profile.chapter_id),
          ...chapters.filter((c) => c.id !== profile.chapter_id),
        ]
      : chapters;

  // Filter chapters by search query
  const filteredChapters = orderedChapters.filter((chapter) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      chapter.name?.toLowerCase().includes(query) ||
      chapter.school?.toLowerCase().includes(query) ||
      (chapter as Chapter & { location?: string }).location?.toLowerCase().includes(query)
    );
  });

  const selectedChapter = orderedChapters.find((c) => c.id === activeChapterId);
  const displayLabel = selectedChapter
    ? selectedChapter.name
    : hasMultipleMemberships && !isDeveloper && !isGovernance
      ? 'Select chapter'
      : isGovernance
        ? 'Select chapter'
        : 'Developer View';

  const DROPDOWN_WIDTH = 280;
  const VIEWPORT_PADDING = 16;

  const getDropdownPosition = () => {
    if (!triggerRef.current || typeof window === 'undefined') return {};
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    const spaceOnRight = viewportWidth - rect.left - VIEWPORT_PADDING;
    const wouldOverflowRight = spaceOnRight < DROPDOWN_WIDTH;

    let left: number;
    let width: number;

    if (wouldOverflowRight) {
      left = Math.max(VIEWPORT_PADDING, rect.right - DROPDOWN_WIDTH);
      width = Math.min(DROPDOWN_WIDTH, rect.right - left);
    } else {
      left = rect.left;
      width = Math.min(DROPDOWN_WIDTH, viewportWidth - rect.left - VIEWPORT_PADDING);
    }

    return {
      top: rect.bottom + 4,
      left,
      minWidth: width,
      width,
    };
  };

  return (
    <div className="flex items-center gap-1.5 min-w-0 max-w-full">
      {hasMultipleMemberships && !isDeveloper && !isGovernance && (
        <span
          className="hidden md:inline text-xs text-gray-500 whitespace-nowrap shrink-0"
          title="Feed, directory, and chapter tools use this chapter until you switch."
        >
          Viewing
        </span>
      )}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        title={displayLabel}
        className={cn(
          'flex items-center justify-center shrink-0 h-8 w-8 rounded-full p-0 text-sm font-medium transition-all duration-200 shadow-sm',
          'md:h-8 md:min-w-0 md:max-w-full md:w-auto md:justify-start md:gap-2 md:rounded-full md:px-3',
          activeChapterId
            ? 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        )}
      >
        <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="hidden md:inline truncate md:max-w-[120px] lg:max-w-[160px] text-left">
          {displayLabel}
        </span>
        <ChevronDown
          className={cn(
            'hidden md:block h-3.5 w-3.5 flex-shrink-0 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {mounted &&
        isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[99999] rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden"
            style={getDropdownPosition()}
          >
            {/* Search input — only show when there are many chapters */}
            {chapters.length > 5 && (
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search chapters..."
                    className="w-full h-8 pl-8 pr-8 text-sm rounded-md border border-gray-200 bg-gray-50 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* "Developer Overview" option (deselect chapter) - developers only */}
            {isDeveloper && !isGovernance && !hasMultipleMemberships && (
              <div className="py-1 border-b border-gray-100">
                <button
                  onClick={() => handleSelect(null)}
                  className={cn(
                    'w-full flex items-center px-3 py-2 text-sm transition-colors',
                    !activeChapterId
                      ? 'bg-brand-primary/5 text-brand-primary font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <Building2 className="h-4 w-4 mr-2.5 flex-shrink-0" />
                  <span>Developer Overview</span>
                </button>
              </div>
            )}

            {/* Chapter list */}
            <div className="max-h-[280px] overflow-y-auto py-1">
              {loading ? (
                <div className="px-3 py-4 text-center text-sm text-gray-500">
                  Loading chapters...
                </div>
              ) : filteredChapters.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-gray-500">
                  No chapters found
                </div>
              ) : (
                filteredChapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    onClick={() => handleSelect(chapter.id)}
                    className={cn(
                      'w-full flex items-start justify-start text-left px-3 py-2.5 text-sm transition-colors',
                      activeChapterId === chapter.id
                        ? 'bg-brand-primary/5 text-brand-primary font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    <div className="flex min-w-0 w-full flex-col items-stretch gap-0.5 text-left">
                      <span className="block truncate font-medium leading-snug">
                        {chapter.name}
                        {chapter.is_primary && hasMultipleMemberships && (
                          <span className="ml-1.5 text-xs text-gray-400 font-normal">(primary)</span>
                        )}
                      </span>
                      {chapter.school && (
                        <span className="block truncate text-left text-xs font-normal leading-snug text-gray-500">
                          {chapter.school}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
