import { useCallback, useState } from "react"
import { toast } from "sonner"

/**
 * D-06: Retry a failed codec probe.
 *
 * POSTs to /api/cameras/:id/probe which returns 202 Accepted and enqueues
 * a BullMQ probe job. The backend uses jobId probe:{cameraId} (D-04) to
 * deduplicate rapid double-clicks — multiple retries collapse safely.
 */
export function useProbeRetry(cameraId: string) {
  const [isRetrying, setIsRetrying] = useState(false)

  const retry = useCallback(async () => {
    setIsRetrying(true)
    try {
      const res = await fetch(`/api/cameras/${cameraId}/probe`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error(`Retry failed: ${res.status}`)
      }
      toast.success("Probe retry queued.")
    } catch {
      toast.error("Couldn't retry probe. Try again in a moment.")
    } finally {
      setIsRetrying(false)
    }
  }, [cameraId])

  return { retry, isRetrying }
}
