"use client"

import { useRef } from "react"
import { Camera as CameraIcon, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CameraCard } from "./camera-card"
import type { CameraRow } from "./cameras-columns"

const MAX_CONCURRENT = 6

interface CameraCardGridProps {
  cameras: CameraRow[]
  loading: boolean
  onViewStream: (camera: CameraRow) => void
  onEdit: (camera: CameraRow) => void
  onDelete: (camera: CameraRow) => void
  onRecordToggle: (camera: CameraRow) => void
  onStreamToggle: (camera: CameraRow) => void
  onEmbedCode: (camera: CameraRow) => void
  onCreateCamera?: () => void
}

export function CameraCardGrid({
  cameras,
  loading,
  onViewStream,
  onEdit,
  onDelete,
  onRecordToggle,
  onStreamToggle,
  onEmbedCode,
  onCreateCamera,
}: CameraCardGridProps) {
  const activePlayersRef = useRef(0)

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border">
            <Skeleton className="aspect-video rounded-t-lg" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16">
        <CameraIcon className="size-12 text-muted-foreground" />
        <p className="text-sm font-medium">No cameras found</p>
        <p className="text-sm text-muted-foreground">
          Try adjusting your filters or add a new camera.
        </p>
        {onCreateCamera && (
          <Button size="sm" onClick={onCreateCamera}>
            <Plus className="mr-2 size-4" />
            Add Camera
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 md:gap-4">
      {cameras.map((camera) => (
        <CameraCard
          key={camera.id}
          camera={camera}
          onViewStream={onViewStream}
          onEdit={onEdit}
          onDelete={onDelete}
          onRecordToggle={onRecordToggle}
          onStreamToggle={onStreamToggle}
          onEmbedCode={onEmbedCode}
          activePlayersRef={activePlayersRef}
          maxConcurrent={MAX_CONCURRENT}
        />
      ))}
    </div>
  )
}
