"use client"

import { AlertTriangle, Loader2, RotateCw } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useProbeRetry } from "@/hooks/use-probe-retry"
import { normalizeCodecInfo } from "@/lib/codec-info"
import { cn } from "@/lib/utils"

interface CodecStatusCellProps {
  codecInfo: unknown
  cameraName: string
  cameraId: string
  /**
   * Phase 19.1 — true when the camera is push+transcode. The codec shown in
   * this cell is the SOURCE codec (what the encoder sends); when transcoding
   * is active the platform converts it to H.264/AAC before delivery. A small
   * "transcoded" badge appears next to the codec text so operators can see
   * at a glance that auto-transcode is engaged.
   */
  transcoding?: boolean
}

/**
 * D-05: 5-state codec cell (D-16 added 'mismatch' in Phase 19.1).
 *   - null / malformed / never-probed  → em-dash
 *   - status="pending"                 → spinner + "Probing…" tooltip
 *   - status="failed"                  → amber warning + inline retry
 *   - status="mismatch"                → amber warning (no retry) + codec-mismatch tooltip
 *   - status="success"                 → codec text (e.g. "H.264") + optional transcoded badge
 *
 * D-07: All shape normalization happens at the prop boundary via
 * normalizeCodecInfo, so legacy rows self-heal on read.
 */
export function CodecStatusCell({
  codecInfo,
  cameraName,
  cameraId,
  transcoding,
}: CodecStatusCellProps) {
  const info = normalizeCodecInfo(codecInfo)

  if (!info) {
    return <span className="text-xs font-mono text-muted-foreground">—</span>
  }

  if (info.status === "pending") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                role="status"
                aria-label={`Probing codec for camera ${cameraName}`}
                aria-live="polite"
                className="inline-flex items-center"
              >
                <Loader2
                  className="size-3.5 text-muted-foreground motion-safe:animate-spin motion-reduce:opacity-60"
                  aria-hidden="true"
                />
              </span>
            }
          />
          <TooltipContent>Probing…</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (info.status === "failed") {
    return (
      <FailedCell
        cameraId={cameraId}
        cameraName={cameraName}
        error={info.error}
      />
    )
  }

  // D-16: codec mismatch (passthrough mode received non-H.264/AAC). No inline
  // retry — user must open the camera detail sheet to switch to Transcode or
  // update the camera. Amber AlertTriangle matches the visual tier of 'failed'
  // so operators immediately see something is wrong.
  if (info.status === "mismatch") {
    const codec = info.mismatchCodec ?? info.video?.codec ?? ""
    const tooltip = "Codec mismatch — open camera to resolve"
    const ariaLabel = codec
      ? `Codec mismatch for ${cameraName}: camera sending ${codec}`
      : `Codec mismatch for ${cameraName}`
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                role="status"
                aria-label={ariaLabel}
                className="inline-flex items-center"
              >
                <AlertTriangle
                  className="size-3.5 text-amber-600 dark:text-amber-500"
                  aria-hidden="true"
                />
              </span>
            }
          />
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // status === 'success'
  const codec = info.video?.codec ?? "—"
  if (transcoding) {
    return (
      <TooltipProvider>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-xs font-mono text-muted-foreground">{codec}</span>
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  aria-label="Transcoded to H.264/AAC for delivery"
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5",
                    "text-[10px] font-medium uppercase tracking-wide",
                    "bg-sky-100 text-sky-700",
                    "dark:bg-sky-950/40 dark:text-sky-300",
                  )}
                >
                  transcoded
                </span>
              }
            />
            <TooltipContent>
              Source codec shown. Platform converts to H.264/AAC for delivery.
            </TooltipContent>
          </Tooltip>
        </span>
      </TooltipProvider>
    )
  }
  return (
    <span className="text-xs font-mono text-muted-foreground">{codec}</span>
  )
}

function FailedCell({
  cameraId,
  cameraName,
  error,
}: {
  cameraId: string
  cameraName: string
  error?: string
}) {
  const { retry, isRetrying } = useProbeRetry(cameraId)
  const tooltipText = error ? `Probe failed: ${error}` : "Probe failed"
  const ariaLabel = error
    ? `Probe failed for ${cameraName}: ${error}`
    : `Probe failed for ${cameraName}`

  return (
    <TooltipProvider>
      <span
        role="status"
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1.5"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <AlertTriangle
                className="size-3.5 text-amber-600 dark:text-amber-500"
                aria-hidden="true"
              />
            }
          />
          <TooltipContent>{tooltipText}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={retry}
                disabled={isRetrying}
                aria-label={`Retry probe for ${cameraName}`}
                className={cn(
                  "inline-flex items-center justify-center rounded p-0.5",
                  "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:opacity-60"
                )}
              >
                {isRetrying ? (
                  <Loader2
                    className="size-3.5 text-amber-600 dark:text-amber-500 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <RotateCw
                    className="size-3.5 text-amber-600 dark:text-amber-500"
                    aria-hidden="true"
                  />
                )}
              </button>
            }
          />
          <TooltipContent>
            {isRetrying ? "Queuing retry…" : "Retry probe"}
          </TooltipContent>
        </Tooltip>
      </span>
    </TooltipProvider>
  )
}
