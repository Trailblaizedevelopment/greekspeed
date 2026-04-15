'use client';

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROFILE_SELECT_FIELD_MAX_LENGTH } from '@/lib/constants/profileConstants';
import { clampProfileSelectValue } from '@/lib/utils/profileFieldStrings';

function getScrollParents(node: HTMLElement | null): HTMLElement[] {
  const parents: HTMLElement[] = [];
  let el: HTMLElement | null = node?.parentElement ?? null;
  while (el) {
    const style = window.getComputedStyle(el);
    const overflow = `${style.overflow}${style.overflowY}${style.overflowX}`;
    if (/(auto|scroll|overlay)/.test(overflow)) {
      parents.push(el);
    }
    el = el.parentElement;
  }
  return parents;
}

type ListItem =
  | { type: 'custom'; value: string }
  | { type: 'option'; option: { value: string; label: string } };

interface SearchableSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  maxHeight?: string;
  /** When true, user can commit text that is not in `options` (Enter or "Use …" row). */
  allowCustom?: boolean;
  /** Max length for a custom committed value (defaults to PROFILE_SELECT_FIELD_MAX_LENGTH). */
  customMaxLength?: number;
  /**
   * When set, the dropdown is portaled into this node (e.g. Vaul `Drawer.Content`) instead of
   * `document.body`, so the search input stays focusable inside modal focus traps. On narrow
   * viewports, passing this also switches mobile from inline `absolute` to the same portaled
   * path (needed for iOS keyboard + drawers). Prefer a `position: relative` host without
   * `overflow: hidden|clip` on the same node; put `overflow-y-auto` on an inner child.
   */
  portalContainerRef?: RefObject<HTMLElement | null>;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  className,
  disabled = false,
  maxHeight = '280px',
  allowCustom = false,
  customMaxLength = PROFILE_SELECT_FIELD_MAX_LENGTH,
  portalContainerRef,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isMobile, setIsMobile] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /** Search row + borders inside portaled panel (used to size list when panelMaxHeightPx is set). */
  const PANEL_SEARCH_CHROME_PX = 56;

  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
    /** Portaled host: total panel max-height (px) for flip + iOS visual viewport. */
    panelMaxHeightPx?: number;
  } | null>(null);

  const effectiveOptions = useMemo(() => {
    if (!allowCustom) return options;
    const v = value?.trim();
    if (!v) return options;
    const exists = options.some(
      (o) => o.value === v || o.label.toLowerCase() === v.toLowerCase()
    );
    if (exists) return options;
    return [...options, { value: v, label: v }];
  }, [options, value, allowCustom]);

  /** When set, use the desktop portaled dropdown path on mobile too (e.g. inside Vaul drawer + iOS keyboard). */
  const hasPortalHost = portalContainerRef != null;

  const selectedOption = effectiveOptions.find((opt) => opt.value === value);
  const displayLabel =
    value !== undefined && value !== null && value !== '' && !selectedOption
      ? value
      : selectedOption
        ? selectedOption.label
        : placeholder;

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return effectiveOptions;
    return effectiveOptions.filter((option) => option.label.toLowerCase().includes(q));
  }, [effectiveOptions, searchQuery]);

  const trimmedQueryRaw = searchQuery.trim();
  const customCommitValue = clampProfileSelectValue(trimmedQueryRaw, customMaxLength);

  const hasExactInPreset = useMemo(() => {
    const tq = trimmedQueryRaw.toLowerCase();
    if (!tq) return true;
    return effectiveOptions.some(
      (o) => o.value.toLowerCase() === tq || o.label.toLowerCase() === tq
    );
  }, [effectiveOptions, trimmedQueryRaw]);

  const showCustomRow =
    allowCustom && trimmedQueryRaw.length > 0 && !hasExactInPreset && customCommitValue.length > 0;

  const listItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    if (showCustomRow) {
      items.push({ type: 'custom', value: customCommitValue });
    }
    for (const option of filteredOptions) {
      items.push({ type: 'option', option });
    }
    return items;
  }, [showCustomRow, customCommitValue, filteredOptions]);

  const handleSelect = useCallback(
    (optionValue: string) => {
      onValueChange?.(optionValue);
      setIsOpen(false);
      setSearchQuery('');
      setHighlightedIndex(-1);
    },
    [onValueChange]
  );

  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (isMobile && !hasPortalHost) {
        if (wrapperRef.current && !wrapperRef.current.contains(target)) {
          setIsOpen(false);
          setSearchQuery('');
          setHighlightedIndex(-1);
        }
      } else {
        if (
          triggerRef.current &&
          !triggerRef.current.contains(target) &&
          dropdownRef.current &&
          !dropdownRef.current.contains(target)
        ) {
          setIsOpen(false);
          setSearchQuery('');
          setHighlightedIndex(-1);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isMobile, hasPortalHost]);

  // Desktop only: auto-focus search input (skip on mobile to avoid keyboard)
  useEffect(() => {
    if (isOpen && !isMobile && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, isMobile]);

  useEffect(() => {
    if (!isOpen) return;
    if (showCustomRow) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [searchQuery, showCustomRow, isOpen]);

  // Keyboard navigation (desktop, or mobile with portaled dropdown host)
  useEffect(() => {
    if (!isOpen || (isMobile && !hasPortalHost)) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < listItems.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter' && highlightedIndex >= 0) {
        e.preventDefault();
        const item = listItems[highlightedIndex];
        if (item.type === 'custom') {
          handleSelect(item.value);
        } else {
          handleSelect(item.option.value);
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMobile, hasPortalHost, listItems, highlightedIndex, handleSelect]);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    if (highlightedIndex >= 0 && listItems[highlightedIndex]) {
      const item = listItems[highlightedIndex];
      if (item.type === 'custom') {
        handleSelect(item.value);
      } else {
        handleSelect(item.option.value);
      }
    } else if (showCustomRow && customCommitValue) {
      handleSelect(customCommitValue);
    }
  };

  // ── Desktop-only: portal position sync + scroll lock ──

  const updateDropdownPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const gap = 4;
    const container = portalContainerRef?.current ?? null;

    if (container) {
      const cRect = container.getBoundingClientRect();
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      const safeTop = vv ? Math.max(cRect.top, vv.offsetTop) : cRect.top;
      const safeBottom = vv ? Math.min(cRect.bottom, vv.offsetTop + vv.height) : cRect.bottom;

      const spaceBelow = Math.max(0, safeBottom - rect.bottom - margin);
      const spaceAbove = Math.max(0, rect.top - safeTop - margin);

      const panelCap = Math.min(
        448,
        vv ? vv.height * 0.88 : typeof window !== 'undefined' ? window.innerHeight * 0.7 : 560
      );
      const minPanel = 120;
      const maxDropdownPreferUp = 200;

      const shouldOpenUpward =
        spaceBelow < maxDropdownPreferUp && spaceAbove > spaceBelow;

      const left = Math.max(margin, rect.left - cRect.left);
      const maxW = Math.max(0, cRect.width - left - margin);
      const desiredMin = Math.max(rect.width, 280);
      const width = Math.min(desiredMin, maxW);

      let top: number;
      let panelMaxHeightPx: number;

      if (!shouldOpenUpward) {
        panelMaxHeightPx = Math.min(panelCap, Math.max(minPanel, spaceBelow - gap));
        top = rect.bottom - cRect.top + gap;
      } else {
        panelMaxHeightPx = Math.min(panelCap, Math.max(minPanel, spaceAbove - gap));
        top = rect.top - cRect.top - panelMaxHeightPx - gap;
        if (top < margin) {
          const shrinkBy = margin - top;
          top = margin;
          panelMaxHeightPx = Math.max(minPanel, panelMaxHeightPx - shrinkBy);
        }
      }

      setDropdownRect((prev) => {
        if (
          prev &&
          prev.top === top &&
          prev.left === left &&
          prev.width === width &&
          prev.panelMaxHeightPx === panelMaxHeightPx
        ) {
          return prev;
        }
        return { top, left, width, panelMaxHeightPx };
      });
      return;
    }

    const vw = window.innerWidth;
    const desiredMin = Math.max(rect.width, 280);
    const maxWidthFromLeft = vw - rect.left - margin;
    const width = Math.min(desiredMin, maxWidthFromLeft);
    const left = Math.max(margin, Math.min(rect.left, vw - width - margin));
    const top = rect.bottom + 4;
    setDropdownRect((prev) => {
      if (prev && prev.top === top && prev.left === left && prev.width === width) return prev;
      return { top, left, width };
    });
  }, [portalContainerRef]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setDropdownRect(null);
      return;
    }
    if (isMobile && !hasPortalHost) {
      setDropdownRect(null);
      return;
    }

    updateDropdownPosition();

    const trigger = triggerRef.current;
    const scrollParents = getScrollParents(trigger);
    const onMove = () => updateDropdownPosition();

    // Avoid locking overflow on mobile drawer scroll parents (breaks scroll + iOS keyboard).
    const scrollLockTarget =
      isMobile && hasPortalHost ? null : scrollParents[0] ?? null;
    const previousOverflow = scrollLockTarget ? scrollLockTarget.style.overflow : '';
    if (scrollLockTarget) scrollLockTarget.style.overflow = 'hidden';

    scrollParents.forEach((p) => p.addEventListener('scroll', onMove, { passive: true }));
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', onMove);
    vv?.addEventListener('scroll', onMove);

    let ro: ResizeObserver | undefined;
    if (trigger) {
      ro = new ResizeObserver(onMove);
      ro.observe(trigger);
    }

    return () => {
      if (scrollLockTarget) scrollLockTarget.style.overflow = previousOverflow;
      scrollParents.forEach((p) => p.removeEventListener('scroll', onMove));
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      vv?.removeEventListener('resize', onMove);
      vv?.removeEventListener('scroll', onMove);
      ro?.disconnect();
    };
  }, [isOpen, isMobile, hasPortalHost, updateDropdownPosition]);

  // Desktop-only: manual wheel → scrollTop so list scrolls while parent is locked
  useEffect(() => {
    if ((isMobile && !hasPortalHost) || !isOpen || !dropdownRect) return;
    const panel = dropdownRef.current;
    const list = listRef.current;
    if (!panel || !list) return;

    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      const max = Math.max(0, list.scrollHeight - list.clientHeight);
      if (max <= 0) {
        e.preventDefault();
        return;
      }
      list.scrollTop = Math.min(max, Math.max(0, list.scrollTop + e.deltaY));
      e.preventDefault();
    };

    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => panel.removeEventListener('wheel', onWheel);
  }, [isOpen, isMobile, hasPortalHost, dropdownRect]);

  // ── Shared dropdown content ──

  const dropdownContent = (
    <>
      {/* Search input */}
      <div className="shrink-0 p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            maxLength={allowCustom ? customMaxLength + 32 : undefined}
            className="w-full h-8 pl-8 pr-8 text-sm rounded-md border border-gray-200 bg-gray-50 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              type="button"
            >
              <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {/* Options list */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y"
        style={{
          maxHeight:
            dropdownRect?.panelMaxHeightPx != null
              ? `${Math.max(40, dropdownRect.panelMaxHeightPx - PANEL_SEARCH_CHROME_PX)}px`
              : maxHeight,
        }}
      >
        {listItems.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            No options found
          </div>
        ) : (
          listItems.map((item, index) =>
            item.type === 'custom' ? (
              <button
                key={`custom-${item.value}`}
                type="button"
                onClick={() => handleSelect(item.value)}
                className={cn(
                  'w-full flex items-center px-3 py-2 text-sm text-left transition-colors border-b border-gray-100',
                  'text-brand-primary font-medium bg-brand-primary/5 hover:bg-brand-primary/10',
                  highlightedIndex === index && 'ring-1 ring-inset ring-brand-primary/30'
                )}
              >
                Use &quot;{item.value}&quot;
              </button>
            ) : (
              <button
                key={item.option.value === '' ? '__empty__' : item.option.value}
                type="button"
                onClick={() => handleSelect(item.option.value)}
                className={cn(
                  'w-full flex items-center px-3 py-2 text-sm text-left transition-colors',
                  value === item.option.value
                    ? 'bg-brand-primary/5 text-brand-primary font-medium'
                    : 'text-gray-700 hover:bg-gray-50',
                  highlightedIndex === index && 'bg-gray-100'
                )}
              >
                {item.option.label}
              </button>
            )
          )
        )}
      </div>
    </>
  );

  // ── Mobile: inline absolutely-positioned dropdown unless a portal host is provided (drawer / modal) ──

  if (isMobile && !hasPortalHost) {
    return (
      <div ref={wrapperRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm',
            'focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary',
            'hover:border-gray-400 transition-colors',
            disabled && 'cursor-not-allowed opacity-50 bg-gray-50',
            className
          )}
        >
          <span className={cn(selectedOption ? 'text-gray-900' : 'text-gray-500', 'truncate')}>
            {displayLabel}
          </span>
          <ChevronDown
            className={cn('h-4 w-4 text-gray-400 transition-transform flex-shrink-0', isOpen && 'rotate-180')}
          />
        </button>

        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[min(60vh,20rem)] flex flex-col rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden overscroll-contain"
          >
            {dropdownContent}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: portal dropdown (body or modal/drawer container for focus trap) ──

  const portalParent = portalContainerRef?.current ?? null;
  const portalTarget = portalParent ?? document.body;
  const useDrawerRelativePosition = portalParent !== null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm',
          'focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary',
          'hover:border-gray-400 transition-colors',
          disabled && 'cursor-not-allowed opacity-50 bg-gray-50',
          className
        )}
      >
        <span className={cn(selectedOption ? 'text-gray-900' : 'text-gray-500', 'truncate')}>
          {displayLabel}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-gray-400 transition-transform flex-shrink-0', isOpen && 'rotate-180')}
        />
      </button>

      {mounted &&
        isOpen &&
        dropdownRect &&
        createPortal(
          <div
            ref={dropdownRef}
            className={cn(
              'z-[100100] flex flex-col rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden overscroll-contain pointer-events-auto',
              useDrawerRelativePosition ? 'absolute' : 'fixed',
              dropdownRect.panelMaxHeightPx == null && 'max-h-[min(70dvh,28rem)]'
            )}
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              ...(dropdownRect.panelMaxHeightPx != null
                ? { maxHeight: `${dropdownRect.panelMaxHeightPx}px` }
                : {}),
            }}
          >
            {dropdownContent}
          </div>,
          portalTarget
        )}
    </>
  );
}
