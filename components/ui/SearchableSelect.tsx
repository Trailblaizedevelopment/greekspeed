'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface SearchableSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  maxHeight?: string;
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

  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

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

      if (isMobile) {
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
  }, [isOpen, isMobile]);

  // Desktop only: auto-focus search input (skip on mobile to avoid keyboard)
  useEffect(() => {
    if (isOpen && !isMobile && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, isMobile]);

  const filteredOptions = options.filter((option) => {
    if (!searchQuery.trim()) return true;
    return option.label.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const handleSelect = (optionValue: string) => {
    onValueChange?.(optionValue);
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
  };

  // Keyboard navigation (desktop)
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter' && highlightedIndex >= 0) {
        e.preventDefault();
        handleSelect(filteredOptions[highlightedIndex].value);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMobile, filteredOptions, highlightedIndex]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  // ── Desktop-only: portal position sync + scroll lock ──

  const updateDropdownPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
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
  }, []);

  useLayoutEffect(() => {
    if (isMobile || !isOpen) {
      setDropdownRect(null);
      return;
    }

    updateDropdownPosition();

    const trigger = triggerRef.current;
    const scrollParents = getScrollParents(trigger);
    const onMove = () => updateDropdownPosition();

    const scrollLockTarget = scrollParents[0];
    const previousOverflow = scrollLockTarget ? scrollLockTarget.style.overflow : '';
    if (scrollLockTarget) scrollLockTarget.style.overflow = 'hidden';

    scrollParents.forEach((p) => p.addEventListener('scroll', onMove, { passive: true }));
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);

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
      ro?.disconnect();
    };
  }, [isOpen, isMobile, updateDropdownPosition]);

  // Desktop-only: manual wheel → scrollTop so list scrolls while parent is locked
  useEffect(() => {
    if (isMobile || !isOpen || !dropdownRect) return;
    const panel = dropdownRef.current;
    const list = listRef.current;
    if (!panel || !list) return;

    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      const max = Math.max(0, list.scrollHeight - list.clientHeight);
      if (max <= 0) { e.preventDefault(); return; }
      list.scrollTop = Math.min(max, Math.max(0, list.scrollTop + e.deltaY));
      e.preventDefault();
    };

    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => panel.removeEventListener('wheel', onWheel);
  }, [isOpen, isMobile, dropdownRect]);

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
            placeholder={searchPlaceholder}
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
        style={{ maxHeight }}
      >
        {filteredOptions.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            No options found
          </div>
        ) : (
          filteredOptions.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={cn(
                'w-full flex items-center px-3 py-2 text-sm text-left transition-colors',
                value === option.value
                  ? 'bg-brand-primary/5 text-brand-primary font-medium'
                  : 'text-gray-700 hover:bg-gray-50',
                highlightedIndex === index && 'bg-gray-100'
              )}
            >
              {option.label}
            </button>
          ))
        )}
      </div>
    </>
  );

  // ── Mobile: inline absolutely-positioned dropdown (no portal) ──

  if (isMobile) {
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
          <span className={cn(value ? 'text-gray-900' : 'text-gray-500', 'truncate')}>
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

  // ── Desktop: fixed portal dropdown ──

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
        <span className={cn(value ? 'text-gray-900' : 'text-gray-500', 'truncate')}>
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
            className="fixed z-[100100] max-h-[min(70dvh,28rem)] flex flex-col rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden overscroll-contain pointer-events-auto"
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
            }}
          >
            {dropdownContent}
          </div>,
          document.body
        )}
    </>
  );
}
