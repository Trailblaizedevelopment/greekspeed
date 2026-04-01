'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/supabase/auth-context';
import Image from 'next/image';

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
    const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionStart, setMentionStart] = useState(-1);
    const { getAuthHeaders } = useAuth();
    const abortRef = useRef<AbortController | null>(null);

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

    const fetchSuggestions = useCallback(
      async (query: string) => {
        if (!chapterId || query.length === 0) {
          setSuggestions([]);
          setShowDropdown(false);
          return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const headers = getAuthHeaders();
          const res = await fetch(
            `/api/mentions/search?q=${encodeURIComponent(query)}&chapterId=${encodeURIComponent(chapterId)}`,
            { headers, signal: controller.signal }
          );
          if (!res.ok) {
            setSuggestions([]);
            return;
          }
          const data = await res.json();
          if (!controller.signal.aborted) {
            setSuggestions(data.users ?? []);
            setShowDropdown((data.users ?? []).length > 0);
            setSelectedIndex(0);
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('Mention search failed:', err);
          setSuggestions([]);
        }
      },
      [chapterId, getAuthHeaders]
    );

    const detectMentionQuery = useCallback(
      (text: string, cursorPos: number) => {
        const before = text.slice(0, cursorPos);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) {
          setShowDropdown(false);
          return;
        }

        const charBefore = atIdx > 0 ? before[atIdx - 1] : undefined;
        if (charBefore && !/[\s(,;:!?\n]/.test(charBefore)) {
          setShowDropdown(false);
          return;
        }

        const query = before.slice(atIdx + 1);
        if (/\s/.test(query) && query.length > 20) {
          setShowDropdown(false);
          return;
        }

        if (/[^a-zA-Z0-9.\-]/.test(query)) {
          setShowDropdown(false);
          return;
        }

        setMentionQuery(query);
        setMentionStart(atIdx);
        fetchSuggestions(query);
      },
      [fetchSuggestions]
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

        setShowDropdown(false);
        setSuggestions([]);

        requestAnimationFrame(() => {
          const pos = before.length + insertion.length;
          textarea.focus();
          textarea.setSelectionRange(pos, pos);
        });
      },
      [mentionStart, mentionQuery, value, onChange]
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
            setShowDropdown(false);
            return;
          }
        }
        onKeyDown?.(e);
        onKeyPress?.(e);
      },
      [showDropdown, suggestions, selectedIndex, insertMention, onKeyDown, onKeyPress]
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
          setShowDropdown(false);
        }
      };
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }, [showDropdown]);

    useEffect(() => {
      if (!showDropdown || !dropdownRef.current) return;
      const selected = dropdownRef.current.children[selectedIndex] as HTMLElement | undefined;
      selected?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, showDropdown]);

    return (
      <div className="relative">
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

        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
            role="listbox"
          >
            {suggestions.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={idx === selectedIndex}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  idx === selectedIndex
                    ? 'bg-brand-primary/10'
                    : 'hover:bg-gray-50'
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
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {s.full_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">@{s.username}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);

export default MentionTextarea;
