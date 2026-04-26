'use client';

/**
 * Phase 22 Plan 22-11 — Bulk "Add tag" popover (D-11, D-13).
 *
 * Reuses {@link TagInputCombobox} in single-tag mode (multi=false, freeText=true)
 * to let an org admin add ONE tag to N selected cameras via
 * `POST /api/cameras/bulk/tags` (Plan 22-06 endpoint).
 *
 * UI-SPEC contract (lines 172–195):
 * - Toolbar trigger label: `Add tag` (variant="outline").
 * - Popover heading: `Add tag to {N} cameras`.
 * - Input placeholder: `Type to search or create…`.
 * - Primary CTA: `Add tag` (single primary button — no confirm dialog per D-13).
 * - Cancel: `Cancel`.
 * - Toast success: `Tag '{tag}' added to {N} cameras` (Sonner).
 * - Toast error: `Couldn't update tags. Try again.` — popover stays open so user can retry.
 *
 * Negative Assertion #2 (UI-SPEC lines 117–121): NO `--destructive` token in this
 * file. Bulk Add is non-destructive (D-13).
 */

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { apiFetch } from '@/lib/api';

import { TagInputCombobox } from './tag-input-combobox';

export interface BulkAddTagPopoverProps {
  cameraIds: string[];
  /** Called after a successful bulk add — parent should refetch + clear selection. */
  onSuccess: () => void;
}

export function BulkAddTagPopover({
  cameraIds,
  onSuccess,
}: BulkAddTagPopoverProps) {
  const [open, setOpen] = useState(false);
  // Single-tag mode: TagInputCombobox.value is always 0..1 strings.
  const [tag, setTag] = useState<string[]>([]);
  const [distinctTags, setDistinctTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Plan 22-05: GET /cameras/tags/distinct returns { tags: string[] } already
    // alphabetized + first-seen casing per D-04. Same fallback toast as the
    // camera form's distinct-tags fetch failure path (UI-SPEC §Toasts).
    apiFetch<{ tags: string[] }>('/api/cameras/tags/distinct')
      .then((data) => setDistinctTags(data?.tags ?? []))
      .catch(() => {
        toast.error("Couldn't load tag suggestions. Try again.");
        setDistinctTags([]);
      });
  }, [open]);

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
            action: 'add',
            tag: target,
          }),
        },
      );
      const n = data?.updatedCount ?? 0;
      toast.success(`Tag '${target}' added to ${n} cameras`);
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            Add tag
          </Button>
        }
      />
      <PopoverContent className="w-[280px]" align="start">
        <div className="text-xs font-medium text-muted-foreground">
          Add tag to {cameraIds.length} cameras
        </div>
        <TagInputCombobox
          value={tag}
          onChange={setTag}
          suggestions={distinctTags}
          multi={false}
          freeText
          placeholder="Type to search or create…"
          ariaLabel="Add tag"
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
            Add tag
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
