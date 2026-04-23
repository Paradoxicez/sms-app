"use client"

import { useState } from "react"
import { Radio, Circle } from "lucide-react"
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

import { type CameraRow } from "./cameras-columns"
import { CameraStatusBadge } from "./camera-status-badge"
import { HlsPlayer } from "@/components/recordings/hls-player"
import { ResolvedPolicyCard } from "@/app/admin/policies/components/resolved-policy-card"
import { AuditLogDataTable } from "@/components/audit/audit-log-data-table"
import { normalizeCodecInfo } from "@/lib/codec-info"
import { CodecMismatchBanner } from "./codec-mismatch-banner"
import { PushUrlSection } from "./push-url-section"
import { WaitingForFirstPublish } from "./waiting-for-first-publish"

interface ViewStreamSheetProps {
  camera: CameraRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStreamToggle?: (camera: CameraRow) => void
  onRecordToggle?: (camera: CameraRow) => void
  onRefresh?: () => void
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

  return (
    <>
      <SheetHeader className="p-4 border-b">
        <SheetTitle className="text-lg font-semibold">{camera.name}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          {camera.site?.name}
          {camera.site?.project?.name ? ` > ${camera.site.project.name}` : ""}
        </SheetDescription>
      </SheetHeader>

      <Tabs defaultValue="preview" className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mx-4 mt-2">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1">
            {onStreamToggle && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => onStreamToggle(camera)}
                title={camera.status === "online" ? "Stop Stream" : "Start Stream"}
              >
                <Radio className="size-4" />
              </Button>
            )}
            {onRecordToggle && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => onRecordToggle(camera)}
                title={camera.isRecording ? "Stop Recording" : "Start Recording"}
              >
                <Circle className={`size-4 ${camera.isRecording ? "fill-red-500 text-red-500" : ""}`} />
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="preview" className="flex-1 overflow-y-auto p-4 space-y-4">
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
          <AuditLogDataTable
            apiUrl={`/api/audit-log?resource=camera&search=${camera.id}`}
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
