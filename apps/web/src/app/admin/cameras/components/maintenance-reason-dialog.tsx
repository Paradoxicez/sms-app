"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

const REASON_MAX = 200

export type MaintenanceReasonTarget =
  | { type: "single"; cameraName: string }
  | { type: "bulk"; count: number }

interface MaintenanceReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: MaintenanceReasonTarget | null
  submitting?: boolean
  onConfirm: (args: { reason: string | undefined }) => void
}

/**
 * Phase 20 D-07 + D-03 — Maintenance reason capture dialog (single + bulk).
 *
 * Behavior invariants (from UI-SPEC §Copywriting §"Maintenance reason dialog"):
 *   - Reason is optional, capped at 200 chars with a live `{n}/200` counter
 *   - Confirm label: "Enter Maintenance" (NOT destructive)
 *   - Submitting: shows Loader2 spinner + "Entering maintenance…" label
 *   - Cancel + Esc close without firing onConfirm
 *   - Whitespace-only reason collapses to undefined (trimmed)
 *   - Reason state resets to empty on every close (D-04 UI-SPEC)
 *
 * The optional reason is forwarded as POST body `{ reason?: string }` — the
 * backend persists it to the audit trail via AuditInterceptor (Phase 20 T-20-05
 * mitigation). No DB schema change required.
 */
export function MaintenanceReasonDialog({
  open,
  onOpenChange,
  target,
  submitting = false,
  onConfirm,
}: MaintenanceReasonDialogProps) {
  const [reason, setReason] = useState("")

  // D-04 UI-SPEC: reset reason whenever dialog closes so next open starts fresh.
  useEffect(() => {
    if (!open) setReason("")
  }, [open])

  if (!target) return null

  const title =
    target.type === "single"
      ? "Enter Maintenance Mode"
      : `Enter Maintenance Mode for ${target.count} Cameras`

  const description =
    target.type === "single"
      ? `Camera "${target.cameraName}" will stop streaming and stop recording. Notifications and webhooks are suppressed while in maintenance.`
      : `${target.count} cameras will stop streaming and stop recording. Notifications and webhooks are suppressed while in maintenance.`

  const handleConfirm = () => {
    const trimmed = reason.trim()
    onConfirm({ reason: trimmed === "" ? undefined : trimmed })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="maintenance-reason">Reason (optional)</Label>
          <div className="relative">
            <Textarea
              id="maintenance-reason"
              placeholder="e.g. Lens cleaning, firmware upgrade"
              value={reason}
              onChange={(e) =>
                setReason(e.target.value.slice(0, REASON_MAX))
              }
              maxLength={REASON_MAX}
              rows={3}
              disabled={submitting}
              aria-describedby="maintenance-reason-helper"
            />
            <span
              className="absolute bottom-1.5 right-2 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {reason.length}/{REASON_MAX}
            </span>
          </div>
          <p
            id="maintenance-reason-helper"
            className="text-xs text-muted-foreground"
          >
            Logged to the audit trail. Visible to your team.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Entering maintenance…
              </>
            ) : (
              "Enter Maintenance"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
