'use client';

import type { ReactNode } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { CanonicalPlace, CanonicalPlaceConfirmed } from '@/types/canonicalPlace';
import {
  formatCanonicalPlaceDisplay,
  parseCanonicalPlaceConfirmed,
} from '@/types/canonicalPlace';
import type { GeocodingSuggestion } from '@/lib/mapbox/geocodeSuggestDto';
import { cn } from '@/lib/utils';

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MIN_QUERY = 2;

export interface LocationPickerProps {
  label: ReactNode;
  /** Persisted or draft canonical place; null when empty. */
  value: CanonicalPlace | null;
  /** Fired after a list row is chosen and `/api/geocoding/confirm` succeeds (or null when cleared). */
  onChange: (place: CanonicalPlaceConfirmed | null) => void;
  /** Stable id for input + listbox (a11y). */
  fieldId: string;
  /** Optional ISO 3166-1 alpha-2 filter forwarded to suggest. */
  country?: string;
  /** Optional Mapbox `worldview` for suggest + confirm. */
  worldview?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Characters required before calling suggest (default 2; API minimum is 2). */
  minQueryLength?: number;
  debounceMs?: number;
  /** When true, show a clear control when there is a confirmed value. Default true. */
  allowClear?: boolean;
}

interface SuggestResponse {
  data?: { suggestions: GeocodingSuggestion[] };
  error?: string;
}

interface ConfirmResponse {
  data?: { place: CanonicalPlaceConfirmed };
  error?: string;
}

function menuStyle(rect: DOMRect): React.CSSProperties {
  return {
    position: 'fixed',
    top: rect.bottom + 4,
    left: rect.left,
    width: Math.max(rect.width, 220),
    maxHeight: 'min(40vh, 280px)',
    overflowY: 'auto',
    zIndex: 10060,
  };
}

export function LocationPicker({
  label,
  value,
  onChange,
  fieldId,
  country,
  worldview,
  disabled,
  className,
  placeholder = 'Start typing a city or region…',
  minQueryLength = DEFAULT_MIN_QUERY,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  allowClear = true,
}: LocationPickerProps) {
  const listboxId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Browser timers use numeric ids (distinct from Node's Timeout type). */
  const blurTimerRef = useRef<number | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);

  const [inputValue, setInputValue] = useState(() => formatCanonicalPlaceDisplay(value));
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<React.CSSProperties | null>(null);

  const effectiveMin = Math.max(2, minQueryLength);

  useEffect(() => {
    setInputValue(formatCanonicalPlaceDisplay(value));
  }, [value]);

  const updateMenuPosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos(menuStyle(rect));
  }, []);

  useLayoutEffect(() => {
    if (!open || suggestions.length === 0) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, suggestions, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateMenuPosition]);

  const runSuggest = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < effectiveMin) {
        setSuggestions([]);
        setSuggestLoading(false);
        return;
      }

      suggestAbortRef.current?.abort();
      const ac = new AbortController();
      suggestAbortRef.current = ac;

      setSuggestLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ q: trimmed, limit: '8' });
        if (country) params.set('country', country);
        if (worldview) params.set('worldview', worldview);

        const res = await fetch(`/api/geocoding/suggest?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
          signal: ac.signal,
        });
        const json = (await res.json()) as SuggestResponse;

        if (!res.ok) {
          setSuggestions([]);
          setError(typeof json.error === 'string' ? json.error : 'Could not load suggestions');
          return;
        }

        setSuggestions(Array.isArray(json.data?.suggestions) ? json.data!.suggestions : []);
        setHighlightIndex(-1);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setSuggestions([]);
        setError('Could not load suggestions');
      } finally {
        setSuggestLoading(false);
      }
    },
    [country, effectiveMin, worldview]
  );

  useEffect(() => {
    const q = inputValue.trim();
    if (q.length < effectiveMin) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }

    const t = window.setTimeout(() => {
      void runSuggest(q);
    }, debounceMs);

    return () => window.clearTimeout(t);
  }, [inputValue, debounceMs, effectiveMin, runSuggest]);

  const cancelBlurClose = useCallback(() => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const closeList = useCallback(() => {
    setOpen(false);
    setHighlightIndex(-1);
    setMenuPos(null);
  }, []);

  const handleSelect = useCallback(
    async (suggestion: GeocodingSuggestion) => {
      cancelBlurClose();
      setConfirmLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/geocoding/confirm', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mapbox_id: suggestion.mapbox_id,
            ...(country ? { country } : {}),
            ...(worldview ? { worldview } : {}),
          }),
        });
        const json = (await res.json()) as ConfirmResponse;

        if (!res.ok || !json.data?.place) {
          setError(typeof json.error === 'string' ? json.error : 'Could not confirm this place');
          return;
        }

        const parsed = parseCanonicalPlaceConfirmed(json.data.place);
        if (!parsed.success) {
          setError('Could not confirm this place');
          return;
        }

        onChange(parsed.data);
        setInputValue(formatCanonicalPlaceDisplay(parsed.data));
        setSuggestions([]);
        closeList();
        inputRef.current?.blur();
      } catch {
        setError('Could not confirm this place');
      } finally {
        setConfirmLoading(false);
      }
    },
    [cancelBlurClose, closeList, country, onChange, worldview]
  );

  const handleInputChange = (next: string) => {
    setInputValue(next);
    setError(null);
    setOpen(true);
  };

  const handleFocus = () => {
    cancelBlurClose();
    setOpen(true);
  };

  const handleBlur = () => {
    blurTimerRef.current = window.setTimeout(() => {
      closeList();
      setInputValue(formatCanonicalPlaceDisplay(value));
      blurTimerRef.current = null;
    }, 180);
  };

  const handleClear = () => {
    cancelBlurClose();
    onChange(null);
    setInputValue('');
    setSuggestions([]);
    closeList();
    setError(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      const idx = highlightIndex >= 0 ? highlightIndex : 0;
      const pick = suggestions[idx];
      if (pick) {
        e.preventDefault();
        void handleSelect(pick);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeList();
      setInputValue(formatCanonicalPlaceDisplay(value));
    }
  };

  const showMenu = open && suggestions.length > 0 && menuPos && typeof document !== 'undefined';

  const listbox = showMenu ? (
    <ul
      id={listboxId}
      role="listbox"
      aria-label="Location suggestions"
      className="rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
      style={menuPos}
    >
      {suggestions.map((s, idx) => (
        <li
          key={s.mapbox_id}
          id={`${fieldId}-opt-${idx}`}
          role="option"
          aria-selected={highlightIndex === idx}
          className={cn(
            'cursor-pointer px-3 py-2 text-sm text-gray-900',
            highlightIndex === idx ? 'bg-gray-100' : 'hover:bg-gray-50'
          )}
          onMouseDown={(ev) => {
            ev.preventDefault();
            void handleSelect(s);
          }}
          onMouseEnter={() => setHighlightIndex(idx)}
        >
          <span className="font-medium">{s.formatted_display}</span>
          {s.feature_type ? (
            <span className="ml-2 text-xs text-gray-500">{s.feature_type}</span>
          ) : null}
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={fieldId} className="flex items-center gap-2">
          {label}
        </Label>
        {allowClear && value && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-gray-600"
            onClick={handleClear}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
      <div ref={wrapRef} className="relative">
        <Input
          ref={inputRef}
          id={fieldId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={suggestions.length > 0 ? listboxId : undefined}
          aria-activedescendant={
            highlightIndex >= 0 ? `${fieldId}-opt-${highlightIndex}` : undefined
          }
          aria-busy={suggestLoading || confirmLoading}
          disabled={disabled || confirmLoading}
          value={inputValue}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={onKeyDown}
          className={cn((suggestLoading || confirmLoading) && 'pr-10')}
        />
        {(suggestLoading || confirmLoading) && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          </span>
        )}
      </div>
      {showMenu ? createPortal(listbox, document.body) : null}
      <p className="text-xs text-gray-500">
        Choose a suggestion — free text alone is not saved as your location.
      </p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
