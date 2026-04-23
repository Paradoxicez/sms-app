"use client"

import { Loader2 } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface WaitingForFirstPublishProps {
  camera: { firstPublishAt: string | null; status: string }
}

/**
 * Phase 19.1 D-26 — empty-state block for push cameras awaiting first publish.
 *
 * Auto-hides when EITHER:
 *   - camera.firstPublishAt is non-null (camera has published at least once), OR
 *   - camera.status === 'online' (currently online — defensive second gate).
 *
 * UI-SPEC copy invariants (must match §"First-publish empty state"):
 *   - Heading: "Waiting for first publish…"
 *   - Body: "Once your camera connects, status will switch to Online and codec
 *           info will appear."
 *   - Checklist heading: "Troubleshooting"
 *   - Checklist items (exact strings):
 *       · Port 1935 reachable from your camera's network
 *       · H.264 video + AAC audio recommended
 *       · Paste the full URL including /push/...
 *   - Docs link: "See full guide →"
 *
 * Loader2 icon is NOT animated (no `animate-spin`) — per UI-SPEC we want a
 * calm empty state, not a false "loading" signal.
 */
export function WaitingForFirstPublish({
  camera,
}: WaitingForFirstPublishProps) {
  if (camera.firstPublishAt || camera.status === "online") return null

  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader className="text-center">
        <Loader2
          className="mx-auto size-6 text-muted-foreground opacity-60"
          aria-hidden="true"
        />
        <CardTitle className="text-base font-medium">
          Waiting for first publish…
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          Once your camera connects, status will switch to Online and codec
          info will appear.
        </p>
        <div className="text-left max-w-sm mx-auto">
          <h4 className="text-sm font-medium">Troubleshooting</h4>
          <ul className="list-none mt-2 space-y-1 text-sm text-muted-foreground">
            <li>· Port 1935 reachable from your camera&apos;s network</li>
            <li>· H.264 video + AAC audio recommended</li>
            <li>· Paste the full URL including /push/...</li>
          </ul>
          <a
            href="/docs/push-setup"
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            See full guide →
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
