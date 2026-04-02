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
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { DismissableLayerBranch } from '@radix-ui/react-dismissable-layer';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/supabase/auth-context';
import Image from 'next/image';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';

/** Above Radix Dialog (z-50) so mention list is not clipped by modal overflow. */
const MENTION_DROPDOWN_Z = 200;

const MENTION_DEBOUNCE_MS = 200;
const EMPTY_SUGGEST_CACHE_TTL_MS = 5000;

/** Max list height when there is room (viewport-capped when near edges). Desktop only. */
const MENTION_DROPDOWN_MAX_H = 320;
/** Prefer opening below unless less than this many px are available (then flip above if better). */
const MENTION_DROPDOWN_MIN_USABLE = 112;

/** Mobile: full-width bottom sheet instead of anchored popup (max-width matches md breakpoint). */
const MOBILE_SHEET_MQ = '(max-width: 767px)';

function useMobileMentionSheetEnabled(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_SHEET_MQ).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_SHEET_MQ);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
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

/** Visible viewport (accounts for mobile keyboard / iOS chrome when `visualViewport` exists). */
interface ViewportMetrics {
  top: number;
  height: number;
}

function getViewportMetrics(): ViewportMetrics {
  if (typeof window === 'undefined') {
    return { top: 0, height: 0 };
  }
  const vv = window.visualViewport;
  if (vv) {
    return { top: vv.offsetTop, height: vv.height };
  }
  return { top: 0, height: window.innerHeight };
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
  /**
   * On narrow viewports only: render the mention list under the textarea instead of a bottom sheet.
   * Use inside Radix `Dialog` (e.g. Create post) so scroll/touch stay in `DialogContent`.
   */
  mentionMobilePresentation?: 'inline-below';
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
      mentionMobilePresentation,
    },
    ref
  ) {
    const isNarrowMobile = useMobileMentionSheetEnabled();
    const useInlineBelowOnMobile =
      isNarrowMobile && mentionMobilePresentation === 'inline-below';
    const useSheetOnMobile = isNarrowMobile && !useInlineBelowOnMobile;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const sheetListRef = useRef<HTMLDivElement>(null);
    const sheetSearchRef = useRef<HTMLInputElement>(null);
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

    const closeMentionUi = useCallback(() => {
      cancelPendingMentionRequests();
      setShowDropdown(false);
      setSuggestions([]);
      setDropdownLayout(null);
    }, [cancelPendingMentionRequests]);

    /** Replace the `@query` segment in `value` after `mentionStart` (same rules as typing in the textarea). */
    const applyMentionQueryToText = useCallback(
      (q: string) => {
        if (mentionStart < 0) return;
        const tail = value.slice(mentionStart + 1);
        const m = tail.match(/^[a-zA-Z0-9.\-]*/);
        const oldLen = m?.[0]?.length ?? 0;
        const newValue =
          value.slice(0, mentionStart + 1) + q + value.slice(mentionStart + 1 + oldLen);
        if (newValue !== value) onChange(newValue);
        setMentionQuery(q);
      },
      [value, mentionStart, onChange]
    );

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

      const { top: viewportTop, height: visibleHeight } = getViewportMetrics();
      const viewportBottom = viewportTop + visibleHeight;
      const minTop = viewportTop + pad;

      const spaceBelow = viewportBottom - rect.bottom - gap - pad;
      const spaceAbove = rect.top - viewportTop - pad - gap;

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

      if (top < minTop) {
        maxHeight = Math.max(0, maxHeight - (minTop - top));
        top = minTop;
      }
      maxHeight = Math.min(maxHeight, viewportBottom - pad - top);

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

    const mentionPickerOpen = showDropdown && suggestions.length > 0;
    const mobileSheetOpen = useSheetOnMobile && mentionPickerOpen;
    const mobileInlineBelowOpen = useInlineBelowOnMobile && mentionPickerOpen;
    const desktopDropdownOpen = !isNarrowMobile && mentionPickerOpen;
    const textareaDrivenPickerOpen =
      desktopDropdownOpen || mobileInlineBelowOpen;

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (textareaDrivenPickerOpen) {
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
            closeMentionUi();
            return;
          }
        } else if (mobileSheetOpen && e.key === 'Escape') {
          e.preventDefault();
          closeMentionUi();
          return;
        }
        onKeyDown?.(e);
        onKeyPress?.(e);
      },
      [
        textareaDrivenPickerOpen,
        mobileSheetOpen,
        suggestions,
        selectedIndex,
        insertMention,
        closeMentionUi,
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
      const onPointerOutside = (e: PointerEvent) => {
        const t = e.target as Node;
        if (t instanceof Element && t.closest('[data-mention-sheet]')) return;
        if (
          !dropdownRef.current?.contains(t) &&
          !textareaRef.current?.contains(t)
        ) {
          closeMentionUi();
        }
      };
      document.addEventListener('pointerdown', onPointerOutside);
      return () => document.removeEventListener('pointerdown', onPointerOutside);
    }, [showDropdown, closeMentionUi]);

    useLayoutEffect(() => {
      if (!desktopDropdownOpen) {
        setDropdownLayout(null);
        return;
      }
      updateDropdownPosition();
    }, [desktopDropdownOpen, suggestions.length, value, updateDropdownPosition]);

    useEffect(() => {
      if (!desktopDropdownOpen) return;
      const onReposition = () => updateDropdownPosition();
      window.addEventListener('resize', onReposition);
      window.addEventListener('scroll', onReposition, true);
      const vv = window.visualViewport;
      vv?.addEventListener('resize', onReposition);
      vv?.addEventListener('scroll', onReposition);
      return () => {
        window.removeEventListener('resize', onReposition);
        window.removeEventListener('scroll', onReposition, true);
        vv?.removeEventListener('resize', onReposition);
        vv?.removeEventListener('scroll', onReposition);
      };
    }, [desktopDropdownOpen, updateDropdownPosition]);

    useEffect(() => {
      if (!textareaDrivenPickerOpen || !dropdownRef.current) return;
      if (desktopDropdownOpen && !dropdownLayout) return;
      const selected = dropdownRef.current.children[selectedIndex] as HTMLElement | undefined;
      selected?.scrollIntoView({ block: 'nearest' });
    }, [
      textareaDrivenPickerOpen,
      desktopDropdownOpen,
      dropdownLayout,
      selectedIndex,
    ]);

    useEffect(() => {
      if (!mobileSheetOpen) return;
      const id = requestAnimationFrame(() => sheetSearchRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }, [mobileSheetOpen]);

    useEffect(() => {
      if (!mobileSheetOpen || !sheetListRef.current) return;
      const selected = sheetListRef.current.children[selectedIndex] as HTMLElement | undefined;
      selected?.scrollIntoView({ block: 'nearest' });
    }, [mobileSheetOpen, selectedIndex]);

    const handleSheetOpenChange = useCallback(
      (open: boolean) => {
        if (!open) closeMentionUi();
      },
      [closeMentionUi]
    );

    const handleSheetSearchChange = useCallback(
      (raw: string) => {
        if (/[^a-zA-Z0-9.\-]/.test(raw)) return;
        applyMentionQueryToText(raw);
        requestSuggestions(raw);
        setSelectedIndex(0);
      },
      [applyMentionQueryToText, requestSuggestions]
    );

    const handleSheetSearchKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!suggestions.length) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
        } else if (e.key === 'Enter') {
          e.preventDefault();
          insertMention(suggestions[selectedIndex]);
        }
      },
      [suggestions, selectedIndex, insertMention]
    );

    const suggestionList = (positionClass: string, style: CSSProperties) => (
      <DismissableLayerBranch
        ref={dropdownRef}
        data-mention-suggestions=""
        role="listbox"
        className={cn(
          'pointer-events-auto overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white shadow-lg touch-pan-y',
          positionClass
        )}
        style={{
          WebkitOverflowScrolling: 'touch',
          ...style,
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
              idx === selectedIndex ? 'bg-brand-primary/10' : 'hover:bg-gray-50 active:bg-gray-100'
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
    );

    const portalDropdown =
      desktopDropdownOpen && dropdownLayout && typeof document !== 'undefined'
        ? suggestionList('', {
            position: 'fixed',
            zIndex: MENTION_DROPDOWN_Z,
            top: dropdownLayout.top,
            left: dropdownLayout.left,
            width: dropdownLayout.width,
            maxHeight: dropdownLayout.maxHeight,
          })
        : null;

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

        {portalDropdown ? createPortal(portalDropdown, document.body) : null}

        {mobileInlineBelowOpen
          ? suggestionList(
              'relative z-10 mt-2 w-full max-h-[min(15rem,40dvh)] shadow-md',
              {}
            )
          : null}

        {useSheetOnMobile ? (
          <Sheet open={mobileSheetOpen} onOpenChange={handleSheetOpenChange}>
            <SheetContent
              side="bottom"
              className="max-h-[85dvh] rounded-t-2xl border-t border-slate-200 p-0 flex flex-col gap-0 bg-white"
            >
              <div data-mention-sheet="" className="flex max-h-[85dvh] flex-col">
                <SheetHeader className="border-b border-slate-100 px-4 pb-3 pt-4 text-left">
                  <SheetTitle className="text-base font-semibold text-slate-900">
                    Mention someone
                  </SheetTitle>
                  <p className="mt-1 text-xs text-slate-500">
                    Search your chapter — results update as you type
                  </p>
                </SheetHeader>
                <div className="px-4 pb-3 pt-2">
                  <Input
                    ref={sheetSearchRef}
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    placeholder="Search by name or @username"
                    value={mentionQuery}
                    onChange={(e) => handleSheetSearchChange(e.target.value)}
                    onKeyDown={handleSheetSearchKeyDown}
                    className="h-11 text-base"
                    aria-label="Search people to mention"
                  />
                </div>
                <div
                  ref={sheetListRef}
                  data-mention-suggestions=""
                  role="listbox"
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 px-2 pb-[max(1rem,env(safe-area-inset-bottom))] touch-pan-y"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {suggestions.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      role="option"
                      aria-selected={idx === selectedIndex}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                        idx === selectedIndex ? 'bg-brand-primary/10' : 'hover:bg-slate-50 active:bg-slate-100'
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(s);
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-primary-100/70 ring-1 ring-slate-200 flex items-center justify-center text-brand-primary-hover text-sm font-semibold">
                        {s.avatar_url ? (
                          <Image
                            src={s.avatar_url}
                            alt={s.full_name}
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (s.first_name?.charAt(0) ?? s.full_name?.charAt(0) ?? '?')
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{s.full_name}</p>
                        <p className="text-xs text-slate-500 truncate">@{s.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    );
  }
);


export default MentionTextarea;
