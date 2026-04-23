"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CreatedUrlRevealProps {
  url: string
  title: string
  helperText?: string
  onClose: () => void
}

/**
 * Phase 19.1 D-09 + D-20 — one-time URL reveal body. Shared between
 * camera-form-dialog (create-push) and rotate-key-dialog (rotate).
 *
 * UI-SPEC copy invariants (must match §"Copywriting Contract" verbatim):
 *   - Body heading: "Push this URL to your camera or encoder:"
 *   - Helper default: "You can view this URL anytime from the camera detail panel."
 *   - Primary CTA: "Copy URL" → flashes "Copied" + Check icon for 2s
 *   - Secondary CTA: "Done"
 *   - Docs link: "Setup guide →"
 *   - Post-copy toast: "Copied to clipboard"
 *
 * Ownership model: parent owns the DialogRoot/DialogContent. This component
 * renders only the body content — it's dialog-agnostic so the same composite
 * works inside camera-form-dialog (state swap) and rotate-key-dialog (state
 * swap after confirmation).
 */
export function CreatedUrlReveal({
  url,
  title,
  helperText,
  onClose,
}: CreatedUrlRevealProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Copied to clipboard")
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy — select the URL and copy manually.")
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold leading-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">
        Push this URL to your camera or encoder:
      </p>

      <Input
        readOnly
        value={url}
        aria-label="Generated push URL"
        className="font-mono text-xs"
      />

      <p className="text-xs text-muted-foreground">
        {helperText ??
          "You can view this URL anytime from the camera detail panel."}
      </p>

      <div className="flex items-center justify-between">
        <a
          href="/docs/push-setup"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Setup guide →
        </a>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
          <Button onClick={handleCopy} aria-live="polite">
            {copied ? (
              <>
                <Check className="size-4" aria-hidden="true" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-4" aria-hidden="true" /> Copy URL
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
