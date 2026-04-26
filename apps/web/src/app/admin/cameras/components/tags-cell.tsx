"use client"

/**
 * Phase 22 — TagsCell shared composite (D-14, D-15).
 *
 * Renders up to `maxVisible` tag badges + an overflow `+N` chip when there are
 * more tags than that. Hovering the overflow chip surfaces a Tooltip listing
 * ALL tags (alphabetized, comma-separated) with a header line `All tags ({N})`.
 *
 * Visual contract (UI-SPEC §"Tags column cell spec"):
 *   - Each tag rendered as `<Badge variant="outline">` with neutral tokens
 *     (`bg-neutral-100 text-neutral-700` light / `dark:bg-neutral-800
 *      dark:text-neutral-300` dark).
 *   - Tag values render in display casing (NOT lowercased) per D-03/D-04.
 *   - Empty `tags=[]` → renders nothing (no placeholder, no em-dash) per D-14.
 *   - `+N` chip uses the SAME neutral tokens as the badges — visually
 *     equivalent.
 *
 * Used by:
 *   - cameras-columns.tsx Tags column (Plan 22-08)
 *   - camera-popup.tsx tags row (Plan 22-10)
 *
 * Test contract (apps/web/.../components/__tests__/tags-cell.test.tsx) is
 * populated by Plan 22-08; this implementation already satisfies the contract
 * stub in the test file.
 */

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const TAG_BADGE_CLASS =
  "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"

interface TagsCellProps {
  tags: string[]
  /** Max badges rendered before collapsing to a `+N` overflow chip. Default 3. */
  maxVisible?: number
}

export function TagsCell({ tags, maxVisible = 3 }: TagsCellProps) {
  if (!tags || tags.length === 0) return null

  // Display casing preserved; sorting is case-insensitive but keeps original
  // string for rendering.
  const sorted = [...tags].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  )
  const visible = sorted.slice(0, maxVisible)
  const overflowCount = sorted.length - visible.length

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className={TAG_BADGE_CLASS}
        >
          {tag}
        </Badge>
      ))}
      {overflowCount > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              tabIndex={0}
              role="button"
              aria-label={`Show all ${sorted.length} tags`}
              className="rounded-4xl"
            >
              <Badge
                variant="outline"
                className={TAG_BADGE_CLASS}
              >
                +{overflowCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-[320px]">
              <div className="text-xs font-medium">
                All tags ({sorted.length})
              </div>
              <div className="text-xs">{sorted.join(", ")}</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}
