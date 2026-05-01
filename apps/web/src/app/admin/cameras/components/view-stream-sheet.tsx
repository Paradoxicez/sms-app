"use client"

import { useEffect, useState } from "react"
import { Radio, Circle, Copy } from "lucide-react"
import { toast } from "sonner"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api"

import { type CameraRow } from "./cameras-columns"
import { CameraStatusBadge } from "./camera-status-badge"
import { HlsPlayer } from "@/components/recordings/hls-player"
import { ResolvedPolicyCard } from "@/app/admin/policies/components/resolved-policy-card"
import { AuditLogDataTable } from "@/components/audit/audit-log-data-table"
import { normalizeCodecInfo } from "@/lib/codec-info"
import { CodecMismatchBanner } from "./codec-mismatch-banner"
import { StreamWarningBanner } from "./stream-warning-banner"
import { PushUrlSection } from "./push-url-section"
import { WaitingForFirstPublish } from "./waiting-for-first-publish"

/**
 * Quick task 260501-tgy — local StreamProfile shape for the smart-probe
 * banner's profile picker. Mirrors the subset of fields returned by
 * `/api/stream-profiles` that the banner needs (id, name, codec). We
 * deliberately duplicate the shape rather than refactor into a shared
 * hook — the only other call site (`camera-form-dialog.tsx:153`) uses a
 * larger StreamProfile shape that includes preset/resolution/bitrate.
 */
interface StreamProfile {
  id: string
  name: string
  codec: string
}

interface ViewStreamSheetProps {
  camera: CameraRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStreamToggle?: (camera: CameraRow) => void
  onRecordToggle?: (camera: CameraRow) => void
  onRefresh?: () => void
}

/**
 * Phase 20 D-17 + D-18 — Camera ID chip row (3rd line of the sheet header).
 *
 * - Truncated display: `${id.slice(0,8)}…${id.slice(-8)}` with U+2026 unicode
 *   ellipsis (single code point, NOT three ASCII dots).
 * - Click on chip OR adjacent copy icon writes the FULL 36-char UUID to the
 *   clipboard (not the truncated form). Clipboard pattern mirrors
 *   `push-url-section.tsx:49-56`.
 * - Tooltip on chip hover reveals the full UUID (UUIDs are not secrets —
 *   they appear in embed URLs and playback responses).
 * - Both copy surfaces carry descriptive aria-labels for screen readers.
 */
function IdChipRow({ cameraId }: { cameraId: string }) {
  // D-18: truncated form = 8 prefix + U+2026 ellipsis + 8 suffix.
  const truncated = `${cameraId.slice(0, 8)}…${cameraId.slice(-8)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(cameraId)
      toast.success("Camera ID copied")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  return (
    <TooltipProvider>
      <div className="mt-1 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={copy}
                className="font-mono text-xs h-6 px-2 bg-muted hover:bg-muted/80 rounded-md text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-label={`Camera ID ${cameraId}, click to copy`}
              >
                {truncated}
              </button>
            }
          />
          <TooltipContent>{cameraId}</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          aria-label="Copy camera ID"
        >
          <Copy className="size-3" aria-hidden="true" />
        </Button>
      </div>
    </TooltipProvider>
  )
}

export function ViewStreamContent({
  camera,
  onStreamToggle,
  onRecordToggle,
  onRefresh,
}: {
  camera: CameraRow
  onStreamToggle?: (camera: CameraRow) => void
  onRecordToggle?: (camera: CameraRow) => void
  onRefresh?: () => void
}) {
  const streamUrl = `/api/cameras/${camera.id}/preview/playlist.m3u8`
  const isPush = camera.ingestMode === "push"

  // Phase 19.1 D-16 — component-local dismiss flag so clicking Dismiss hides
  // the banner for the current sheet session without persisting. The banner
  // re-renders on next mismatch-triggering publish (server writes codecInfo).
  const [mismatchDismissed, setMismatchDismissed] = useState(false)
  const showMismatch =
    !mismatchDismissed &&
    normalizeCodecInfo(camera.codecInfo)?.status === "mismatch"

  // Quick task 260501-1n1 — separate dismiss flag for the smart-probe banner.
  // Tracked independently from `mismatchDismissed` because both banners can
  // render simultaneously (e.g. an H.265 Uniview camera) and the user may
  // dismiss one without the other.
  const [warningDismissed, setWarningDismissed] = useState(false)

  // Quick task 260501-tgy — fetch the org's stream profiles on mount and
  // filter out the passthrough (`copy`) profiles. The non-passthrough list
  // feeds the StreamWarningBanner profile picker; an empty list triggers
  // the Create-CTA branch (link to /app/stream-profiles).
  const [transcodeProfiles, setTranscodeProfiles] = useState<StreamProfile[]>(
    [],
  )

  useEffect(() => {
    apiFetch<StreamProfile[]>("/api/stream-profiles")
      .then((profiles) => {
        setTranscodeProfiles(profiles.filter((p) => p.codec !== "copy"))
      })
      .catch(() => setTranscodeProfiles([]))
  }, [])

  async function handleAcceptAutoTranscode() {
    try {
      const res = await fetch(`/api/cameras/${camera.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needsTranscode: true }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMismatchDismissed(true)
      toast.success("Auto-transcode enabled. Retry publish from your camera.")
      onRefresh?.()
    } catch {
      toast.error("Failed to enable auto-transcode. Try again.")
    }
  }

  // Quick task 260501-tgy — switch the camera's Stream Profile via PATCH
  // /api/cameras/:id (Phase 21 hot-reload picks up the streamProfileId
  // change and triggers a stream restart automatically — no extra restart
  // call from the client). Distinct from `handleAcceptAutoTranscode` above
  // which writes the per-camera `needsTranscode` flag for the Phase 19.1
  // D-16 codec-mismatch contract — that flow is unchanged.
  async function handleSwitchProfile(newProfileId: string) {
    try {
      const res = await fetch(`/api/cameras/${camera.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamProfileId: newProfileId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setWarningDismissed(true)
      toast.success("Stream Profile switched. Stream will restart momentarily.")
      onRefresh?.()
    } catch {
      toast.error("Failed to switch profile. Try again.")
    }
  }

  return (
    <>
      <SheetHeader className="p-4 border-b">
        <SheetTitle className="text-lg font-semibold">{camera.name}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          {camera.site?.name}
          {camera.site?.project?.name ? ` > ${camera.site.project.name}` : ""}
        </SheetDescription>
        <IdChipRow cameraId={camera.id} />
      </SheetHeader>

      {/*
       * Phase 22 D-16 — Notes section (read-only).
       *
       * Surfaces `camera.description` between the SheetHeader and the Tabs so
       * users see the camera context where they naturally look for it. Edit
       * affordance lives in the camera form (camera-form.tsx) — this block is
       * intentionally read-only per D-16. Conditional render guard hides the
       * section when description is empty / null / whitespace-only so we never
       * leak an empty header. React auto-escapes the string and
       * `whitespace-pre-line` preserves user newlines via CSS (NOT
       * dangerouslySetInnerHTML), mitigating T-22-11 (XSS).
       */}
      {camera.description && camera.description.trim().length > 0 && (
        <section
          className="mb-6 px-4 pt-4"
          aria-labelledby="camera-notes-heading"
        >
          <h3
            id="camera-notes-heading"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2"
          >
            Notes
          </h3>
          <p className="text-sm whitespace-pre-line">{camera.description}</p>
        </section>
      )}

      <Tabs defaultValue="preview" className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mx-4 mt-2">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          {/*
           * Phase 20 D-19/D-20/D-21 — Expandable pill-button container.
           *
           * min-w-[340px] reserves layout space so toggling active state (which
           * expands a button from w-9 to w-[160px]) never reflows the TabsList.
           * justify-end keeps idle squares right-aligned while the container
           * still occupies 340px.
           *
           * D-22 negative assertion: no ticking-clock / duration counter may
           * appear in this component. The Record pill shows a static "REC"
           * label with a pulsing red dot — never a running timer. Plan 20-04
           * acceptance grep enforces this (zero matches for the forbidden
           * time-API identifiers).
           */}
          <div className="flex items-center gap-2 min-w-[340px] justify-end">
            {onStreamToggle && (
              <button
                type="button"
                onClick={() => onStreamToggle(camera)}
                aria-pressed={camera.status === "online"}
                aria-label={
                  camera.status === "online" ? "Stop stream" : "Start stream"
                }
                className={cn(
                  "inline-flex items-center justify-center rounded-md border text-muted-foreground",
                  "transition-[width,background-color] duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  camera.status === "online"
                    ? "w-[160px] h-9 gap-1.5 bg-red-500 border-transparent px-3 text-white"
                    : "w-9 h-9 border-border bg-background"
                )}
              >
                <Radio
                  className={cn(
                    "size-4",
                    camera.status === "online" &&
                      "motion-safe:animate-pulse motion-reduce:animate-none"
                  )}
                  aria-hidden="true"
                />
                {camera.status === "online" && (
                  <span className="text-xs font-medium">Stop Stream</span>
                )}
              </button>
            )}
            {onRecordToggle && (
              <button
                type="button"
                onClick={() => onRecordToggle(camera)}
                aria-pressed={camera.isRecording}
                aria-label={
                  camera.isRecording ? "Stop recording" : "Start recording"
                }
                className={cn(
                  "inline-flex items-center justify-center rounded-md border text-muted-foreground",
                  "transition-[width,background-color] duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  camera.isRecording
                    ? "w-[160px] h-9 gap-1.5 bg-zinc-900 border-transparent px-3 text-white dark:bg-zinc-800"
                    : "w-9 h-9 border-border bg-background"
                )}
              >
                {camera.isRecording ? (
                  <>
                    <span
                      className="size-2 rounded-full bg-red-500 motion-safe:animate-pulse motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wide">
                      REC
                    </span>
                  </>
                ) : (
                  <Circle className="size-4" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>

        <TabsContent value="preview" className="flex-1 overflow-y-auto p-4 space-y-4">
          {/*
           * Quick task 260501-1n1 — Smart-probe warning banner. Renders
           * BEFORE the codec-mismatch banner so it's the first thing the user
           * sees in the Preview tab. Both banners can render simultaneously
           * when both apply (e.g. an H.265 Uniview camera).
           *
           * The banner re-derives `recommendTranscode` client-side from
           * persisted Camera fields via `deriveRecommendTranscode`, so it
           * surfaces automatically once the StreamProbeProcessor success
           * branch lands the row update.
           *
           * Quick task 260501-tgy — banner self-suppresses when the camera
           * is already transcoding via a non-passthrough Stream Profile
           * (codec !== 'copy') OR the per-camera `needsTranscode` flag is
           * true. The Switch CTA delegates to `handleSwitchProfile` which
           * PATCHes `streamProfileId` (Phase 21 hot-reload restart), NOT
           * the `needsTranscode` flag — that flag stays the contract for
           * the separate CodecMismatchBanner below.
           */}
          {!warningDismissed && (
            <StreamWarningBanner
              camera={{
                id: camera.id,
                needsTranscode: camera.needsTranscode,
                streamWarnings: camera.streamWarnings,
                brandHint: camera.brandHint,
                brandConfidence: camera.brandConfidence,
                streamProfile: camera.streamProfile,
              }}
              transcodeProfiles={transcodeProfiles}
              onSwitchProfile={handleSwitchProfile}
              onDismiss={() => setWarningDismissed(true)}
            />
          )}

          {showMismatch && (
            <CodecMismatchBanner
              camera={camera}
              onAccept={handleAcceptAutoTranscode}
              onDismiss={() => setMismatchDismissed(true)}
            />
          )}

          <HlsPlayer src={streamUrl} autoPlay mode="live" />

          {isPush && (
            <PushUrlSection
              camera={{
                id: camera.id,
                streamUrl: camera.streamUrl,
                ingestMode: camera.ingestMode ?? "push",
              }}
              onRotated={() => onRefresh?.()}
            />
          )}

          {isPush && (
            <WaitingForFirstPublish
              camera={{
                firstPublishAt: camera.firstPublishAt ?? null,
                status: camera.status,
              }}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Camera Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex items-center justify-between py-1.5 pl-3">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span className="text-sm font-medium">{camera.name}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 pl-3">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <CameraStatusBadge status={camera.status} />
                  </div>
                  <div className="flex items-center justify-between py-1.5 pl-3">
                    <span className="text-sm text-muted-foreground">Site</span>
                    <span className="text-sm font-medium">{camera.site?.name ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 pl-3">
                    <span className="text-sm text-muted-foreground">Project</span>
                    <span className="text-sm font-medium">{camera.site?.project?.name ?? "-"}</span>
                  </div>
                  {(() => {
                    const info = normalizeCodecInfo(camera.codecInfo)
                    const codec =
                      info?.status === "success" ? info.video?.codec ?? "-" : "-"
                    const resolution =
                      info?.status === "success" && info.video
                        ? `${info.video.width}x${info.video.height}`
                        : "-"
                    return (
                      <>
                        <div className="flex items-center justify-between py-1.5 pl-3">
                          <span className="text-sm text-muted-foreground">Codec</span>
                          <span className="text-sm font-medium font-mono">{codec}</span>
                        </div>
                        <div className="flex items-center justify-between py-1.5 pl-3">
                          <span className="text-sm text-muted-foreground">Resolution</span>
                          <span className="text-sm font-medium font-mono">{resolution}</span>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>

            <ResolvedPolicyCard cameraId={camera.id} />
          </div>
        </TabsContent>

        <TabsContent value="activity" className="flex-1 overflow-y-auto p-4">
          {/*
            Scope the Activity tab to this single camera. We pass `resourceId`
            (the canonical column the interceptor populates) rather than
            `search` because `search` is a free-text OR-clause across multiple
            text columns and cannot reliably narrow to one entity. See
            .planning/debug/resolved/view-stream-activity-tab-no-events.md.
          */}
          <AuditLogDataTable
            apiUrl={`/api/audit-log?resource=camera&resourceId=${camera.id}`}
            hideResourceColumn
          />
        </TabsContent>
      </Tabs>
    </>
  )
}

export function ViewStreamSheet({
  camera,
  open,
  onOpenChange,
  onStreamToggle,
  onRecordToggle,
  onRefresh,
}: ViewStreamSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full md:!w-1/2 sm:!max-w-none p-0 flex flex-col"
      >
        {camera && (
          <ViewStreamContent
            camera={camera}
            onStreamToggle={onStreamToggle}
            onRecordToggle={onRecordToggle}
            onRefresh={onRefresh}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
