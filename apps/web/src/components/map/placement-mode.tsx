"use client"

import { useCallback, useEffect, useState } from "react"
import { Marker, Popup } from "react-leaflet"
import L from "leaflet"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api"

// --- State machine types ---

export type PlacementState =
  | { mode: "idle" }
  | { mode: "placing"; cameraId: string; cameraName: string }
  | {
      mode: "confirming"
      cameraId: string
      cameraName: string
      lat: number
      lng: number
    }

// --- Hook ---

export function usePlacementMode(onSuccess?: () => void) {
  const [state, setState] = useState<PlacementState>({ mode: "idle" })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const startPlacing = useCallback(
    (cameraId: string, cameraName: string) => {
      setState({ mode: "placing", cameraId, cameraName })
    },
    []
  )

  const onMapClick = useCallback(
    (lat: number, lng: number) => {
      if (state.mode !== "placing") return

      // Clamp lat/lng to valid ranges (T-13-04 threat mitigation)
      const clampedLat = Math.max(-90, Math.min(90, lat))
      const clampedLng = Math.max(-180, Math.min(180, lng))

      setState({
        mode: "confirming",
        cameraId: state.cameraId,
        cameraName: state.cameraName,
        lat: clampedLat,
        lng: clampedLng,
      })
    },
    [state]
  )

  const confirm = useCallback(async () => {
    if (state.mode !== "confirming") return
    setIsSubmitting(true)
    try {
      await apiFetch(`/api/cameras/${state.cameraId}`, {
        method: "PATCH",
        body: JSON.stringify({
          location: { lat: state.lat, lng: state.lng },
        }),
      })
      toast.success("Location updated")
      setState({ mode: "idle" })
      onSuccess?.()
    } catch {
      toast.error("Failed to update location")
    } finally {
      setIsSubmitting(false)
    }
  }, [state, onSuccess])

  const cancel = useCallback(() => {
    setState({ mode: "idle" })
  }, [])

  // Escape key handler
  useEffect(() => {
    if (state.mode === "idle") return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setState({ mode: "idle" })
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [state.mode])

  return { state, startPlacing, onMapClick, confirm, cancel, isSubmitting }
}

// --- UI Components ---

/** Instruction banner rendered outside the MapContainer */
export function PlacementBanner({
  state,
  onCancel,
}: {
  state: PlacementState
  onCancel: () => void
}) {
  if (state.mode === "idle") return null

  return (
    <div
      role="alert"
      className="absolute top-0 left-0 right-0 z-[2000] bg-primary text-primary-foreground py-2 px-4 text-sm text-center"
    >
      {state.mode === "placing"
        ? "Click on the map to set camera location. Press Escape to cancel."
        : `Confirm location for '${state.cameraName}'? Press Escape to cancel.`}
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="ml-2 h-6 text-xs text-primary-foreground hover:text-primary-foreground/80"
      >
        Cancel
      </Button>
    </div>
  )
}

// Pulsing green dot icon for placement preview marker
const placementIcon = L.divIcon({
  className: "placement-marker-icon",
  html: `<div style="
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: #22c55e;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    animation: pulse 2s infinite;
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -10],
})

/** Confirming marker rendered inside the MapContainer */
export function PlacementMarker({
  state,
  onConfirm,
  onCancel,
  isSubmitting,
}: {
  state: PlacementState
  onConfirm: () => void
  onCancel: () => void
  isSubmitting: boolean
}) {
  if (state.mode !== "confirming") return null

  return (
    <Marker
      position={[state.lat, state.lng]}
      icon={placementIcon}
    >
      <Popup autoClose={false} closeOnClick={false}>
        <div className="space-y-2 p-1">
          <p className="text-sm font-medium">
            Set location for &apos;{state.cameraName}&apos;?
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} className="h-7 text-xs">
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onConfirm}
              disabled={isSubmitting}
              className="h-7 text-xs"
            >
              {isSubmitting ? "Saving..." : "Confirm"}
            </Button>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
