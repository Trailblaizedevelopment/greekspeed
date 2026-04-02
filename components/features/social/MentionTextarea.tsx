'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';
import { DismissableLayerBranch } from '@radix-ui/react-dismissable-layer';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/supabase/auth-context';
import Image from 'next/image';

/** Above Radix Dialog (z-50) so mention list is not clipped by modal overflow. */
const MENTION_DROPDOWN_Z = 200;

const MENTION_DEBOUNCE_MS = 200;
const EMPTY_SUGGEST_CACHE_TTL_MS = 5000;

/** Max list height when there is room (viewport-capped when near edges). */
const MENTION_DROPDOWN_MAX_H = 320;
/** Narrow viewports: always open above the field with a shorter list (keyboard / fixed bottom UI). */
const MENTION_DROPDOWN_MOBILE_MAX_H = 200;
/** Prefer opening below unless less than this many px are available (then flip above if better). */
const MENTION_DROPDOWN_MIN_USABLE = 112;

function isMobileMentionLayout(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

/**
 * Radix modal Dialog sets `body { pointer-events: none }`; children inherit it unless reset.
 * `DismissableLayerBranch` registers this node so pointer-down is not treated as "outside" the dialog.
 */

interface DropdownLayout {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface MentionSuggestion {
  id: string;
  username: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  chapterId: string | undefined;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  rows?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Alias for onKeyDown — CommentModal uses onKeyPress */
  onKeyPress?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export interface MentionTextareaHandle {
  focus: () => void;
  blur: () => void;
  readonly value: string;
  readonly scrollHeight: number;
  setSelectionRange: (start: number, end: number) => void;
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
  style: CSSStyleDeclaration;
}

const MentionTextarea = forwardRef<MentionTextareaHandle, MentionTextareaProps>(
  function MentionTextarea(
    {
      value,
      onChange,
      chapterId,
      placeholder,
      className,
      disabled,
      rows,
      onFocus,
      onBlur,
      onKeyDown,
      onKeyPress,
    },
    ref
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownLayout, setDropdownLayout] = useState<DropdownLayout | null>(null);
    const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionStart, setMentionStart] = useState(-1);
    const { user, getAuthHeaders } = useAuth();
    const abortRef = useRef<AbortController | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestQueryForFetchRef = useRef('');
    const emptySuggestCacheRef = useRef<{
      chapterId: string;
      users: MentionSuggestion[];
      fetchedAt: number;
    } | null>(null);

    const cancelPendingMentionRequests = useCallback(() => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      abortRef.current?.abort();
      abortRef.current = null;
    }, []);

    const updateDropdownPosition = useCallback(() => {
      const el = textareaRef.current;
      if (!el || typeof window === 'undefined') return;

      const rect = el.getBoundingClientRect();
      const gap = 6;
      const pad = 8;
      const width = rect.width;
      const left = Math.min(
        Math.max(pad, rect.left),
        Math.max(pad, window.innerWidth - width - pad)
      );

      const viewportH = window.innerHeight;

      if (isMobileMentionLayout()) {
        // Always anchor directly above the input (layout viewport); cap height for keyboards / nav bars.
        const spaceAbove = rect.top - pad - gap;
        let maxHeight = Math.min(
          MENTION_DROPDOWN_MOBILE_MAX_H,
          Math.max(0, spaceAbove)
        );
        let top = rect.top - gap - maxHeight;
        if (top < pad) {
          top = pad;
          maxHeight = Math.min(MENTION_DROPDOWN_MOBILE_MAX_H, Math.max(0, rect.top - gap - top));
        }
        maxHeight = Math.min(maxHeight, viewportH - pad - top);
        setDropdownLayout({ top, left, width, maxHeight });
        return;
      }

      const spaceBelow = viewportH - rect.bottom - gap - pad;
      const spaceAbove = rect.top - pad - gap;

      const capBelow = Math.min(MENTION_DROPDOWN_MAX_H, Math.max(0, spaceBelow));
      const capAbove = Math.min(MENTION_DROPDOWN_MAX_H, Math.max(0, spaceAbove));

      let top: number;
      let maxHeight: number;

      if (capBelow >= MENTION_DROPDOWN_MIN_USABLE) {
        top = rect.bottom + gap;
        maxHeight = capBelow;
      } else if (capAbove >= MENTION_DROPDOWN_MIN_USABLE) {
        maxHeight = capAbove;
        top = rect.top - gap - maxHeight;
      } else if (capBelow >= capAbove) {
        top = rect.bottom + gap;
        maxHeight = capBelow;
      } else {
        maxHeight = capAbove;
        top = rect.top - gap - maxHeight;
      }

      if (top < pad) {
        maxHeight = Math.max(0, maxHeight - (pad - top));
        top = pad;
      }
      maxHeight = Math.min(maxHeight, viewportH - pad - top);

      setDropdownLayout({ top, left, width, maxHeight });
    }, []);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      blur: () => textareaRef.current?.blur(),
      get value() {
        return textareaRef.current?.value ?? '';
      },
      get scrollHeight() {
        return textareaRef.current?.scrollHeight ?? 0;
      },
      setSelectionRange: (start: number, end: number) =>
        textareaRef.current?.setSelectionRange(start, end),
      scrollIntoView: (options?: ScrollIntoViewOptions) =>
        textareaRef.current?.scrollIntoView(options),
      get style() {
        return textareaRef.current!.style;
      },
    }));

    const runSuggestionsFetch = useCallback(
      async (query: string, signal: AbortSignal) => {
        if (!chapterId) return;

        try {
          const headers = getAuthHeaders();
          const res = await fetch(
            `/api/mentions/search?q=${encodeURIComponent(query)}&chapterId=${encodeURIComponent(chapterId)}`,
            { headers, signal }
          );
          if (!res.ok) {
            if (!signal.aborted) {
              setSuggestions([]);
              setShowDropdown(false);
            }
            return;
          }
          const data = await res.json();
          if (signal.aborted) return;
          const users = (data.users ?? []) as MentionSuggestion[];
          setSuggestions(users);
          setShowDropdown(users.length > 0);
          setSelectedIndex(0);
          if (query.length === 0) {
            emptySuggestCacheRef.current = {
              chapterId,
              users,
              fetchedAt: Date.now(),
            };
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('Mention search failed:', err);
          if (!signal.aborted) {
            setSuggestions([]);
            setShowDropdown(false);
          }
        }
      },
      [chapterId, getAuthHeaders]
    );

    const requestSuggestions = useCallback(
      (query: string) => {
        latestQueryForFetchRef.current = query;

        if (!chapterId) {
          setSuggestions([]);
          setShowDropdown(false);
          return;
        }

        cancelPendingMentionRequests();

        if (query.length === 0) {
          const cache = emptySuggestCacheRef.current;
          const now = Date.now();
          if (
            cache &&
            cache.chapterId === chapterId &&
            now - cache.fetchedAt < EMPTY_SUGGEST_CACHE_TTL_MS
          ) {
            setSuggestions(cache.users);
            setShowDropdown(cache.users.length > 0);
            setSelectedIndex(0);
            return;
          }

          const controller = new AbortController();
          abortRef.current = controller;
          void runSuggestionsFetch('', controller.signal);
          return;
        }

        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          const q = latestQueryForFetchRef.current;
          if (q.length === 0) return;

          const controller = new AbortController();
          abortRef.current = controller;
          void runSuggestionsFetch(q, controller.signal);
        }, MENTION_DEBOUNCE_MS);
      },
      [chapterId, cancelPendingMentionRequests, runSuggestionsFetch]
    );

    useEffect(() => {
      emptySuggestCacheRef.current = null;
    }, [chapterId, user?.id]);

    useEffect(() => {
      return () => {
        cancelPendingMentionRequests();
      };
    }, [cancelPendingMentionRequests]);

    const detectMentionQuery = useCallback(
      (text: string, cursorPos: number) => {
        const before = text.slice(0, cursorPos);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) {
          cancelPendingMentionRequests();
          setShowDropdown(false);
          return;
        }

        const charBefore = atIdx > 0 ? before[atIdx - 1] : undefined;
        if (charBefore && !/[\s(,;:!?\n]/.test(charBefore)) {
          cancelPendingMentionRequests();
          setShowDropdown(false);
          return;
        }

        const query = before.slice(atIdx + 1);
        if (/\s/.test(query) && query.length > 20) {
          cancelPendingMentionRequests();
          setShowDropdown(false);
          return;
        }

        if (/[^a-zA-Z0-9.\-]/.test(query)) {
          cancelPendingMentionRequests();
          setShowDropdown(false);
          return;
        }

        setMentionQuery(query);
        setMentionStart(atIdx);
        requestSuggestions(query);
      },
      [cancelPendingMentionRequests, requestSuggestions]
    );

    const insertMention = useCallback(
      (suggestion: MentionSuggestion) => {
        if (mentionStart < 0) return;
        const textarea = textareaRef.current;
        if (!textarea) return;

        const before = value.slice(0, mentionStart);
        const after = value.slice(textarea.selectionEnd ?? mentionStart + mentionQuery.length + 1);
        const insertion = `@${suggestion.username} `;
        const newValue = before + insertion + after;
        onChange(newValue);

        cancelPendingMentionRequests();
        setShowDropdown(false);
        setSuggestions([]);
        setDropdownLayout(null);

        requestAnimationFrame(() => {
          const pos = before.length + insertion.length;
          textarea.focus();
          textarea.setSelectionRange(pos, pos);
        });
      },
      [mentionStart, mentionQuery, value, onChange, cancelPendingMentionRequests]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextValue = e.target.value;
        onChange(nextValue);
        const cursorPos = e.target.selectionStart ?? nextValue.length;
        detectMentionQuery(nextValue, cursorPos);
      },
      [onChange, detectMentionQuery]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showDropdown && suggestions.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev < suggestions.length - 1 ? prev + 1 : 0
            );
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : suggestions.length - 1
            );
            return;
          }
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            insertMention(suggestions[selectedIndex]);
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancelPendingMentionRequests();
            setShowDropdown(false);
            return;
          }
        }
        onKeyDown?.(e);
        onKeyPress?.(e);
      },
      [
        showDropdown,
        suggestions,
        selectedIndex,
        insertMention,
        cancelPendingMentionRequests,
        onKeyDown,
        onKeyPress,
      ]
    );

    const handleClick = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const cursorPos = textarea.selectionStart ?? 0;
      detectMentionQuery(value, cursorPos);
    }, [value, detectMentionQuery]);

    useEffect(() => {
      if (!showDropdown) return;
      const onClickOutside = (e: MouseEvent) => {
        if (
          !dropdownRef.current?.contains(e.target as Node) &&
          !textareaRef.current?.contains(e.target as Node)
        ) {
          cancelPendingMentionRequests();
          setShowDropdown(false);
        }
      };
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }, [showDropdown, cancelPendingMentionRequests]);

    useLayoutEffect(() => {
      if (!showDropdown || suggestions.length === 0) {
        setDropdownLayout(null);
        return;
      }
      updateDropdownPosition();
    }, [showDropdown, suggestions.length, value, updateDropdownPosition]);

    useEffect(() => {
      if (!showDropdown || suggestions.length === 0) return;
      const onReposition = () => updateDropdownPosition();
      window.addEventListener('resize', onReposition);
      window.addEventListener('scroll', onReposition, true);
      return () => {
        window.removeEventListener('resize', onReposition);
        window.removeEventListener('scroll', onReposition, true);
      };
    }, [showDropdown, suggestions.length, updateDropdownPosition]);

    useEffect(() => {
      if (!dropdownLayout || !dropdownRef.current) return;
      const selected = dropdownRef.current.children[selectedIndex] as HTMLElement | undefined;
      selected?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, dropdownLayout]);

    const dropdownOpen = showDropdown && suggestions.length > 0 && dropdownLayout;

    const dropdownNode =
      dropdownOpen && typeof document !== 'undefined' ? (
        <DismissableLayerBranch
          ref={dropdownRef}
          data-mention-suggestions=""
          role="listbox"
          className="pointer-events-auto overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white shadow-lg"
          style={{
            position: 'fixed',
            zIndex: MENTION_DROPDOWN_Z,
            top: dropdownLayout.top,
            left: dropdownLayout.left,
            width: dropdownLayout.width,
            maxHeight: dropdownLayout.maxHeight,
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          {suggestions.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={idx === selectedIndex}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                idx === selectedIndex ? 'bg-brand-primary/10' : 'hover:bg-gray-50'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(s);
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div className="h-8 w-8 rounded-full bg-primary-100/70 flex items-center justify-center text-brand-primary-hover text-xs font-semibold shrink-0 overflow-hidden ring-1 ring-gray-200">
                {s.avatar_url ? (
                  <Image
                    src={s.avatar_url}
                    alt={s.full_name}
                    width={32}
                    height={32}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  (s.first_name?.charAt(0) ?? s.full_name?.charAt(0) ?? '?')
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{s.full_name}</p>
                <p className="text-xs text-gray-500 truncate">@{s.username}</p>
              </div>
            </button>
          ))}
        </DismissableLayerBranch>
      ) : null;

    return (
      <div className="relative w-full min-w-0 flex-1">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          disabled={disabled}
          rows={rows}
        />

        {dropdownNode ? createPortal(dropdownNode, document.body) : null}
      </div>
    );
  }
);

export default MentionTextarea;
