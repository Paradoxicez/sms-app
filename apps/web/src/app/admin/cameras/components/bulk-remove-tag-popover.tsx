'use client';

/**
 * Phase 22 Plan 22-11 — Bulk "Remove tag" popover (D-12, D-13).
 *
 * Reuses {@link TagInputCombobox} in suggestions-only single-tag mode (multi=false,
 * freeText=false) to let an org admin pick ONE existing tag from the union of
 * tags across the selected cameras and remove it via
 * `POST /api/cameras/bulk/tags` with `action: 'remove'` (Plan 22-06 endpoint).
 *
 * UI-SPEC contract (lines 172–195):
 * - Toolbar trigger label: `Remove tag` (variant="outline").
 * - Popover heading: `Remove tag from {N} cameras`.
 * - Input placeholder: `Search current tags…`.
 * - Empty state when selectionTagUnion is empty: `Selected cameras have no tags to remove.`
 *   (parent already gates the toolbar button on this — but defense-in-depth: the
 *   popover renders its own empty state too).
 * - Primary CTA: `Remove tag` (single primary button — no confirm dialog per D-13).
 * - Cancel: `Cancel`.
 * - Toast success: `Tag '{tag}' removed from {N} cameras` (Sonner).
 * - Toast error: `Couldn't update tags. Try again.` — popover stays open so user can retry.
 *
 * Negative Assertion #2 (UI-SPEC lines 117–121): NO `--destructive` token in this
 * file. Bulk Remove is non-destructive per D-11/D-13 — the action is trivially
 * reversible by Bulk Add tag.
 *
 * T-22-14 mitigation: `selectionTagUnion` is computed by the parent from rows
 * already in the user's UI (already authorized) — NO extra fetch is performed by
 * this popover for suggestions.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { apiFetch } from '@/lib/api';

import { TagInputCombobox } from './tag-input-combobox';

export interface BulkRemoveTagPopoverProps {
  cameraIds: string[];
  /** Union of tags across selected rows — computed by parent (T-22-14: no extra fetch). */
  selectionTagUnion: string[];
  /** Called after a successful bulk remove — parent should refetch + clear selection. */
  onSuccess: () => void;
}

export function BulkRemoveTagPopover({
  cameraIds,
  selectionTagUnion,
  onSuccess,
}: BulkRemoveTagPopoverProps) {
  const [open, setOpen] = useState(false);
  // Single-tag mode: TagInputCombobox.value is always 0..1 strings.
  const [tag, setTag] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const target = tag[0]?.trim();
    if (!target || submitting) return;
    setSubmitting(true);
    try {
      const data = await apiFetch<{ updatedCount: number }>(
        '/api/cameras/bulk/tags',
        {
          method: 'POST',
          body: JSON.stringify({
            cameraIds,
            action: 'remove',
            tag: target,
          }),
        },
      );
      const n = data?.updatedCount ?? 0;
      toast.success(`Tag '${target}' removed from ${n} cameras`);
      setTag([]);
      setOpen(false);
      onSuccess();
    } catch {
      toast.error("Couldn't update tags. Try again.");
      // popover stays open so user can retry
    } finally {
      setSubmitting(false);
    }
  }

  const hasTags = selectionTagUnion.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <X className="mr-1.5 size-4" aria-hidden="true" />
            Remove tag
          </Button>
        }
      />
      <PopoverContent className="w-[280px]" align="start">
        <div className="text-xs font-medium text-muted-foreground">
          Remove tag from {cameraIds.length} cameras
        </div>
        {hasTags ? (
          <>
            <TagInputCombobox
              value={tag}
              onChange={setTag}
              suggestions={selectionTagUnion}
              multi={false}
              freeText={false}
              placeholder="Search current tags…"
              ariaLabel="Remove tag"
            />
            <div className="mt-1 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!tag[0] || submitting}
              >
                Remove tag
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Selected cameras have no tags to remove.
            </p>
            <div className="mt-1 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
