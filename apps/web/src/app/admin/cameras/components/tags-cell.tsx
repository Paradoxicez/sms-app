"use client"

import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Phase 22 Plan 22-08 — TagsCell composite (D-14, D-15, D-18).
 *
 * Renders up to `maxVisible` (default 3) alphabetized tag badges. When the
 * input array exceeds `maxVisible`, an additional `+N` overflow chip is
 * rendered; on hover/focus it surfaces a tooltip listing ALL tags
 * alphabetized comma-separated, headed by `All tags ({total})`.
 *
 * Visual contract (UI-SPEC §"Tags column cell spec"):
 *   - Badge variant: `outline` + neutral tokens (`bg-neutral-100 …`).
 *     Phase 22 D-15 forbids per-tag color — every tag/+N chip looks identical.
 *   - Tooltip width: `max-w-[320px]` (D-18).
 *   - Tooltip delay: Radix default — DO NOT pass `delayDuration` (D-18 default).
 *   - Empty input → render nothing (no placeholder, no em-dash; D-14 explicit).
 *
 * Reused by Plan 22-10 (map popup tag row) — keep this stateless and
 * presentation-only.
 */
export interface TagsCellProps {
  tags: string[]
  /** Default 3 (D-14). Map popup may override to 5+ depending on space. */
  maxVisible?: number
}

const TAG_BADGE_CLASSES =
  "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 font-medium"

export function TagsCell({ tags, maxVisible = 3 }: TagsCellProps) {
  // Alphabetic, case-insensitive sort. localeCompare handles non-ASCII safely.
  const sorted = useMemo(
    () =>
      [...tags].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      ),
    [tags],
  )

  if (sorted.length === 0) return null

  const visible = sorted.slice(0, maxVisible)
  const overflowCount = sorted.length - visible.length

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag) => (
        <Badge key={tag} variant="outline" className={TAG_BADGE_CLASSES}>
          {tag}
        </Badge>
      ))}
      {overflowCount > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Show all ${sorted.length} tags`}
                  className={`inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-4xl border border-border px-2 py-0.5 text-xs ${TAG_BADGE_CLASSES} cursor-default focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none`}
                >
                  +{overflowCount}
                </span>
              }
            />
            <TooltipContent className="max-w-[320px]">
              <div className="font-medium">All tags ({sorted.length})</div>
              <div className="text-xs">{sorted.join(", ")}</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}
