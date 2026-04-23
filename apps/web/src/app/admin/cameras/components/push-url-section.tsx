"use client"

import { useState } from "react"
import { Copy, RotateCw } from "lucide-react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { RotateKeyDialog } from "./rotate-key-dialog"

interface PushUrlSectionProps {
  camera: { id: string; streamUrl: string; ingestMode: string }
  onRotated?: () => void
}

/**
 * Phase 19.1 D-07 + D-19 — Push URL card inside ViewStreamSheet Preview tab.
 *
 * Owner-only surface: the backend `serializeCamera(..., { perspective: 'owner' })`
 * guarantees the full URL is present on the camera payload consumed here.
 *
 * UI-SPEC copy invariants (must match §"Copywriting Contract > ViewStreamSheet"):
 *   - Heading: "Push URL"
 *   - Description: "Paste this into your camera or encoder."
 *   - Docs link: "Setup guide →"
 *   - Copy toast: "Copied to clipboard"
 *
 * Inline actions (right of the read-only URL input):
 *   - Copy (icon-only button + tooltip "Copy")
 *   - Rotate (icon-only RotateCw button + tooltip "Rotate") → opens RotateKeyDialog
 */
export function PushUrlSection({ camera, onRotated }: PushUrlSectionProps) {
  const [rotateOpen, setRotateOpen] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(camera.streamUrl)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Couldn't copy — select the URL and copy manually.")
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Push URL</CardTitle>
          <CardDescription>
            Paste this into your camera or encoder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={camera.streamUrl}
              aria-label="Push URL"
              className="font-mono text-xs"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleCopy}
                      aria-label="Copy push URL"
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipContent>Copy</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setRotateOpen(true)}
                      aria-label="Rotate push key"
                    >
                      <RotateCw className="size-4" aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipContent>Rotate</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex justify-end">
            <a
              href="/docs/push-setup"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Setup guide →
            </a>
          </div>
        </CardContent>
      </Card>

      <RotateKeyDialog
        cameraId={camera.id}
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        onSuccess={() => onRotated?.()}
      />
    </>
  )
}
