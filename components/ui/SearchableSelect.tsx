'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        setHighlightedIndex(-1);
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

  // Filter options by search query
  const filteredOptions = options.filter((option) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return option.label.toLowerCase().includes(query);
  });

  // Get the currently selected option label
  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const handleSelect = (optionValue: string) => {
    onValueChange?.(optionValue);
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen, filteredOptions, highlightedIndex]);

  // Reset highlighted index when search changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [highlightedIndex]);

  // Position the dropdown below the trigger
  const getDropdownPosition = () => {
    if (!triggerRef.current) return {};
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 12;
    const vw = window.innerWidth;
    const desiredMin = Math.max(rect.width, 280);
    const maxWidthFromLeft = vw - rect.left - margin;
    const width = Math.min(desiredMin, maxWidthFromLeft);
    const left = Math.max(margin, Math.min(rect.left, vw - width - margin));
    return {
      top: rect.bottom + 4,
      left,
      width,
    };
  };

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
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[99999] rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden"
            style={getDropdownPosition()}
          >
            {/* Search input */}
            <div className="p-2 border-b border-gray-100">
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
              className="overflow-y-auto"
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
          </div>,
          document.body
        )}
    </>
  );
}