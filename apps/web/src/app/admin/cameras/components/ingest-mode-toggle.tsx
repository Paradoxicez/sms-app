"use client"

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react"

import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type IngestMode = "pull" | "push"

interface IngestModeToggleProps {
  value: IngestMode
  onChange: (next: IngestMode) => void
  disabled?: boolean
}

/**
 * Phase 19.1 D-08: segmented [Pull | Push] control at the top of
 * camera-form-dialog. Controlled — parent owns the state.
 *
 * UI-SPEC §"Copywriting Contract > Add Camera Dialog — Push mode":
 *   - Labels: "Pull" / "Push" (visible text)
 *   - Icons: ArrowDownToLine (Pull) / ArrowUpFromLine (Push)
 *   - Hidden screen-reader label above: "Source"
 *
 * UI-SPEC §"Layout & Interaction Patterns > Add Camera dialog":
 *   - Not rendered in edit mode (ingestMode is immutable post-create)
 *   - When disabled, both items are non-interactive.
 */
export function IngestModeToggle({
  value,
  onChange,
  disabled,
}: IngestModeToggleProps) {
  return (
    <div className="space-y-2">
      <Label className="sr-only">Source</Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => {
          if (v === "pull" || v === "push") onChange(v)
        }}
        disabled={disabled}
        variant="outline"
        className="w-full justify-start"
      >
        <ToggleGroupItem
          value="pull"
          aria-label="Pull source type"
          disabled={disabled}
          className="gap-2"
        >
          <ArrowDownToLine className="size-4" aria-hidden="true" />
          <span>Pull</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="push"
          aria-label="Push source type"
          disabled={disabled}
          className="gap-2"
        >
          <ArrowUpFromLine className="size-4" aria-hidden="true" />
          <span>Push</span>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
