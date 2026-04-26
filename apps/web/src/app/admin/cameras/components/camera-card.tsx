"use client"

import { useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import {
  Video,
  MoreHorizontal,
  Pencil,
  Play,
  Circle,
  Code,
  Trash2,
  Radio,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  CameraStatusDot,
  CameraStatusPill,
} from "@/app/admin/cameras/components/camera-status-badge"
import type { CameraRow } from "./cameras-columns"

interface CameraCardProps {
  camera: CameraRow
  onViewStream: (camera: CameraRow) => void
  onEdit: (camera: CameraRow) => void
  onDelete: (camera: CameraRow) => void
  onRecordToggle: (camera: CameraRow) => void
  onStreamToggle: (camera: CameraRow) => void
  onEmbedCode: (camera: CameraRow) => void
  activePlayersRef: React.MutableRefObject<number>
  maxConcurrent: number
}

function HoverPreviewPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 4,
        backBufferLength: 0,
        lowLatencyMode: true,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 5,
        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.withCredentials = true
        },
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })
      hlsRef.current = hls
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [src])

  return (
    <video
      ref={videoRef}
      className="h-full w-full object-cover transition-opacity duration-200"
      muted
      playsInline
    />
  )
}

export function CameraCard({
  camera,
  onViewStream,
  onEdit,
  onDelete,
  onRecordToggle,
  onStreamToggle,
  onEmbedCode,
  activePlayersRef,
  maxConcurrent,
}: CameraCardProps) {
  const [shouldPlay, setShouldPlay] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
      if (shouldPlay) {
        activePlayersRef.current--
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay])

  const onMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      if (activePlayersRef.current < maxConcurrent) {
        activePlayersRef.current++
        setShouldPlay(true)
      }
    }, 300)
  }

  const onMouseLeave = () => {
    clearTimeout(timerRef.current)
    if (shouldPlay) {
      activePlayersRef.current--
      setShouldPlay(false)
    }
  }

  return (
    <div
      className="rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors relative"
      onClick={() => onViewStream(camera)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onViewStream(camera)
        }
      }}
      role="button"
      aria-label={`View stream for ${camera.name}`}
    >
      {/* Thumbnail area */}
      <div
        className="aspect-video bg-muted rounded-t-lg relative overflow-hidden"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {shouldPlay && camera.status === "online" ? (
          <HoverPreviewPlayer
            src={`/api/cameras/${camera.id}/preview/playlist.m3u8`}
          />
        ) : camera.thumbnail ? (
          // Quick task 260425-w7v: snapshot JPEG. The URL already includes
          // a `?v=ts` cache-buster from MinioService.getSnapshotUrl, so the
          // browser refetches automatically when the snapshot is regenerated.
          // {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={camera.thumbnail}
            alt={camera.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Video className="size-12 text-muted-foreground/40" />
          </div>
        )}
        {/* Status badge overlay */}
        <div className="absolute top-2 right-2">
          <CameraStatusPill status={camera.status} />
        </div>
      </div>

      {/* Info area */}
      <div className="p-3 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {/*
              Phase 22 Plan 22-08 (D-17 + D-18). When the description is
              non-empty, surface it as a tooltip on the name. The tooltip
              uses `max-w-[320px]` + `line-clamp-6` per D-18 styling and
              keeps Radix's default delay (no `delayDuration` override).
              When description is null/empty, the bare span renders so no
              tooltip primitives mount.
            */}
            {camera.description?.trim() ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        className="text-sm font-medium truncate"
                        tabIndex={0}
                      >
                        {camera.name}
                      </span>
                    }
                  />
                  <TooltipContent className="max-w-[320px] whitespace-pre-line">
                    <span className="line-clamp-6 inline-block">
                      {camera.description}
                    </span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="text-sm font-medium truncate">
                {camera.name}
              </span>
            )}
            <CameraStatusDot status={camera.status} />
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {camera.site?.name ?? "No site"}
          </p>
        </div>
        {/* "..." menu button -- stopPropagation to prevent card click */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-[160px]">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onEdit(camera)
              }}
            >
              <Pencil className="mr-2 size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onViewStream(camera)
              }}
            >
              <Play className="mr-2 size-4" /> View Stream
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onStreamToggle(camera)
              }}
            >
              <Radio className="mr-2 size-4" />{" "}
              {camera.status === "online" ? "Stop Stream" : "Start Stream"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onRecordToggle(camera)
              }}
            >
              <Circle className="mr-2 size-4" />{" "}
              {camera.isRecording ? "Stop Recording" : "Start Recording"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onEmbedCode(camera)
              }}
            >
              <Code className="mr-2 size-4" /> Embed Code
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(camera)
              }}
            >
              <Trash2 className="mr-2 size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
