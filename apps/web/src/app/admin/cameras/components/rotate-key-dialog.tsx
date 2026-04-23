"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { CreatedUrlReveal } from "./created-url-reveal"

interface RotateKeyDialogProps {
  cameraId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

/**
 * Phase 19.1 D-19 + D-20 — alert-dialog confirmation → one-time URL reveal.
 *
 * Flow:
 *   1. open=true → confirm phase: destructive "Rotate key" CTA + body warning
 *      that the current publisher will be kicked.
 *   2. On confirm → POST /api/cameras/:id/rotate-key.
 *   3. On success → swap dialog body to <CreatedUrlReveal> with title
 *      "Key rotated" + helperText "Old key invalidated. Update your camera to
 *      resume publishing." (UI-SPEC verbatim).
 *   4. On error → toast "Failed to rotate key. The old key is still valid — try
 *      again." and stay in confirm phase (the old key remains authoritative).
 */
export function RotateKeyDialog({
  cameraId,
  open,
  onOpenChange,
  onSuccess,
}: RotateKeyDialogProps) {
  const [phase, setPhase] = useState<"confirm" | "reveal">("confirm")
  const [rotating, setRotating] = useState(false)
  const [newUrl, setNewUrl] = useState("")

  async function handleConfirm() {
    setRotating(true)
    try {
      const res = await fetch(`/api/cameras/${cameraId}/rotate-key`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { streamUrl: string }
      setNewUrl(data.streamUrl)
      setPhase("reveal")
    } catch {
      toast.error(
        "Failed to rotate key. The old key is still valid — try again.",
      )
    } finally {
      setRotating(false)
    }
  }

  function handleClose() {
    onOpenChange(false)
    // Reset local phase so the next open starts at confirm.
    setPhase("confirm")
    setNewUrl("")
    onSuccess?.()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {phase === "confirm" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Rotate push key?</AlertDialogTitle>
              <AlertDialogDescription>
                Any device currently publishing with the old key will be
                disconnected immediately. The new URL must be copied into your
                camera before it can publish again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rotating}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleConfirm()
                }}
                disabled={rotating}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {rotating ? "Rotating…" : "Rotate key"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <CreatedUrlReveal
            url={newUrl}
            title="Key rotated"
            helperText="Old key invalidated. Update your camera to resume publishing."
            onClose={handleClose}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
