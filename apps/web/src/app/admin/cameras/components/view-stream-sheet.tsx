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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { type CameraRow } from "./cameras-columns"
import { CameraStatusBadge } from "./camera-status-badge"
import { HlsPlayer } from "@/components/recordings/hls-player"
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
  const streamUrl = `/api/cameras/${camera.id}/preview/playlist.m3u8`

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
          <HlsPlayer src={streamUrl} autoPlay mode="live" />

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
                  <div className="flex items-center justify-between py-1.5 pl-3">
                    <span className="text-sm text-muted-foreground">Codec</span>
                    <span className="text-sm font-medium font-mono">{camera.codecInfo?.video ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 pl-3">
                    <span className="text-sm text-muted-foreground">Resolution</span>
                    <span className="text-sm font-medium font-mono">
                      {camera.codecInfo?.width && camera.codecInfo?.height
                        ? `${camera.codecInfo.width}x${camera.codecInfo.height}`
                        : "-"}
                    </span>
                  </div>
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
