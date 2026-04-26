'use client';

/**
 * Phase 22 Plan 22-07 — Tag chip combobox composite.
 *
 * Reference:
 * - .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-UI-SPEC.md
 *   §"Chip combobox spec" (lines 280–319) — full mockup + behavioral contract
 *
 * Modes:
 * - multi=true (default) — camera form: many chips, free-text add, case-insensitive dedup.
 * - multi=false — bulk popover single-tag mode (Plan 22-11): Enter/click replaces value with [tag].
 * - freeText=true (default) — user can add tags not in suggestions ("+ Add" row).
 * - freeText=false — bulk Remove popover variant: pick from suggestion list only.
 *
 * Negative Assertion #2 (UI-SPEC lines 117–121): the `--destructive` token MUST NOT
 * appear in this file. Tag-length and tag-count validation are warning-style UX guards,
 * not destructive actions. Use amber tokens (text-amber-700 / dark:text-amber-400).
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

export interface TagInputComboboxProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Suggestions fetched from GET /cameras/tags/distinct (or computed-from-selection in bulk Remove mode). */
  suggestions: string[];
  /** True (camera form): many chips. False (bulk popover): single-tag select replaces value. */
  multi?: boolean;
  /** True (form / bulk Add): allow free-text creation. False (bulk Remove): suggestions-only. */
  freeText?: boolean;
  placeholder?: string;
  /** D-05: cap per-camera tag count (default 20). */
  maxTags?: number;
  /** D-05: cap per-tag length in characters (default 50). */
  maxLength?: number;
  ariaLabel?: string;
  disabled?: boolean;
  /** Bind for <label htmlFor=...>. */
  inputId?: string;
}

export function TagInputCombobox({
  value,
  onChange,
  suggestions,
  multi = true,
  freeText = true,
  placeholder = 'Type to search or add a tag…',
  maxTags = 20,
  maxLength = 50,
  ariaLabel = 'Tags',
  disabled = false,
  inputId,
}: TagInputComboboxProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const lowerValue = useMemo(
    () => new Set(value.map((v) => v.toLowerCase())),
    [value],
  );

  const filteredSuggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, input]);

  // "+ Add" should ONLY render when the query has no match — exact OR substring —
  // in either the suggestion list or the existing chips. If the user is typing
  // 'lob' and 'Lobby' is a suggestion, the "+ Add" row is suppressed because the
  // user can pick the existing tag from the dropdown. Per plan 22-07 <behavior>
  // Test 10 + UI-SPEC §"Chip combobox spec".
  const hasAnyMatch = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return true; // suppress "+ Add" when query is empty
    if (lowerValue.has(q)) return true;
    if (suggestions.some((s) => s.toLowerCase() === q)) return true;
    if (suggestions.some((s) => s.toLowerCase().includes(q))) return true;
    return false;
  }, [suggestions, input, lowerValue]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.length > maxLength) {
      setError(`Tags must be ${maxLength} characters or fewer.`);
      return;
    }
    if (!multi) {
      // Single-tag mode (bulk popover) — replace value, never check against existing chips.
      onChange([trimmed]);
      setInput('');
      setError(null);
      setOpen(false);
      return;
    }
    if (lowerValue.has(trimmed.toLowerCase())) {
      // Silent case-insensitive dedup per D-04 + UI-SPEC §"Validation — duplicate".
      setInput('');
      setError(null);
      return;
    }
    if (value.length >= maxTags) {
      setError(`Maximum ${maxTags} tags per camera.`);
      return;
    }
    onChange([...value, trimmed]);
    setInput('');
    setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(input);
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      // Backspace on empty input removes the last chip — parity with × click.
      onChange(value.slice(0, -1));
      setError(null);
    }
  }

  function handleRemove(tag: string) {
    onChange(value.filter((t) => t !== tag));
    setError(null);
  }

  // Dropdown is shown when the input is focused AND there's something to render
  // (filtered suggestions OR the freeText "+ Add" row). The chip-row uses a
  // role="group" container so tests / a11y tools can locate the composite.
  const showAddRow =
    freeText && input.trim().length > 0 && !hasAnyMatch;
  const showDropdown = open && (filteredSuggestions.length > 0 || showAddRow);

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    // Close dropdown when focus leaves the entire wrapper. Using setTimeout
    // ensures click handlers on suggestion rows fire before the dropdown
    // unmounts.
    const next = e.relatedTarget as Node | null;
    if (next && wrapperRef.current?.contains(next)) return;
    setTimeout(() => setOpen(false), 0);
  }

  return (
    <div ref={wrapperRef} className="relative" onBlur={handleBlur}>
      <div
        role="group"
        aria-label={ariaLabel}
        className={cn(
          'flex flex-wrap items-center gap-1 rounded-md border border-input bg-background p-1 min-h-9',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            <span>{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemove(tag)}
                aria-label={`Remove tag ${tag}`}
                className="size-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        ))}
        <input
          id={inputId}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm h-7 px-1 disabled:cursor-not-allowed"
        />
      </div>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-input bg-popover text-popover-foreground shadow-md"
          role="listbox"
        >
          {filteredSuggestions.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Existing tags
              </div>
              {filteredSuggestions.map((s) => {
                const alreadyChip = lowerValue.has(s.toLowerCase());
                return (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={alreadyChip}
                    disabled={alreadyChip && multi}
                    onClick={() => commit(s)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted',
                      alreadyChip && multi && 'opacity-60 cursor-default',
                    )}
                  >
                    {alreadyChip ? <span aria-hidden>✓</span> : null}
                    <span>{s}</span>
                  </button>
                );
              })}
            </div>
          )}
          {showAddRow && (
            <>
              {filteredSuggestions.length > 0 && (
                <div className="-mx-0 h-px bg-border" />
              )}
              <div className="p-1">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Create new
                </div>
                <button
                  type="button"
                  role="option"
                  onClick={() => commit(input)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                >
                  + Add &quot;{input.trim()}&quot;
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/*
        UI-SPEC Negative Assertion #2 (lines 117-121): the destructive red token
        MUST NOT appear in Phase 22. Tag-length and tag-count guards are
        warning-style UX guards, not destructive actions — use amber tokens
        (text-amber-700 / dark:text-amber-400) for the validation message below.
      */}
      {error && (
        <p
          role="alert"
          className="mt-1 text-xs text-amber-700 dark:text-amber-400"
        >
          {error}
        </p>
      )}
      {multi && !error && (
        <p className="mt-1 text-xs text-muted-foreground">
          Press Enter or comma to add. Backspace removes the last tag.
        </p>
      )}
    </div>
  );
}
