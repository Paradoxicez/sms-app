"use client"

import { Copy } from "lucide-react"
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

import { type CameraRow } from "./cameras-columns"
import { CameraStatusBadge } from "./camera-status-badge"
import { HlsPlayer } from "./hls-player"
import { ResolvedPolicyCard } from "@/app/admin/policies/components/resolved-policy-card"
import { AuditLogDataTable } from "@/components/audit/audit-log-data-table"

interface ViewStreamSheetProps {
  camera: CameraRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ViewStreamContent({ camera }: { camera: CameraRow }) {
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
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="flex-1 overflow-y-auto p-4 space-y-4">
          <HlsPlayer src={streamUrl} autoPlay mode="live" />

          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground font-medium">Name</span>
            <span>{camera.name}</span>

            <span className="text-muted-foreground font-medium">Status</span>
            <span>
              <CameraStatusBadge status={camera.status} />
            </span>

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

            <span className="text-muted-foreground font-medium">Stream URL</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs truncate">{streamUrl}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}${streamUrl}`
                  )
                  toast("Stream URL copied")
                }}
              >
                <Copy className="size-3" />
              </Button>
            </div>
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
}: ViewStreamSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full md:w-1/2 sm:max-w-none p-0 flex flex-col"
      >
        {camera && <ViewStreamContent camera={camera} />}
      </SheetContent>
    </Sheet>
  )
}
