"use client"

import { Radio, Circle } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"

import { type CameraRow } from "./cameras-columns"
import { CameraStatusBadge } from "./camera-status-badge"
import { HlsPlayer } from "./hls-player"
import { ResolvedPolicyCard } from "@/app/admin/policies/components/resolved-policy-card"
import { AuditLogDataTable } from "@/components/audit/audit-log-data-table"

interface ViewStreamSheetProps {
  camera: CameraRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStreamToggle?: (camera: CameraRow) => void
  onRecordToggle?: (camera: CameraRow) => void
}

function ViewStreamContent({
  camera,
  onStreamToggle,
  onRecordToggle,
}: {
  camera: CameraRow
  onStreamToggle?: (camera: CameraRow) => void
  onRecordToggle?: (camera: CameraRow) => void
}) {
  const streamUrl = `/api/cameras/${camera.id}/stream/index.m3u8`

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
            <TabsTrigger value="policies">Policies</TabsTrigger>
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
          <HlsPlayer src={streamUrl} autoPlay mode="live" />

          <div className="grid grid-cols-[7rem_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground font-medium">Name</span>
            <span>{camera.name}</span>

            <span className="text-muted-foreground font-medium">Status</span>
            <span><CameraStatusBadge status={camera.status} /></span>

            <span className="text-muted-foreground font-medium">Site</span>
            <span>{camera.site?.name ?? "-"}</span>

            <span className="text-muted-foreground font-medium">Project</span>
            <span>{camera.site?.project?.name ?? "-"}</span>

            <span className="text-muted-foreground font-medium">Codec</span>
            <span className="font-mono text-xs">
              {camera.codecInfo?.video ?? "-"}
            </span>

            <span className="text-muted-foreground font-medium">Resolution</span>
            <span className="font-mono text-xs">
              {camera.codecInfo?.width && camera.codecInfo?.height
                ? `${camera.codecInfo.width}x${camera.codecInfo.height}`
                : "-"}
            </span>
          </div>
        </TabsContent>

        <TabsContent value="policies" className="flex-1 overflow-y-auto p-4">
          <ResolvedPolicyCard cameraId={camera.id} />
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
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
