/**
 * Pure deriver that turns a raw audit-log entry into a human-readable Action
 * label for the Activity tab on the camera View Stream sheet.
 *
 * Plan: 260426-l5a — Activity-tab UX polish.
 *
 * Design:
 *   - No React, no hooks, no I/O. Safe to call from anywhere.
 *   - Uses a `Rule[]` registry: the first rule whose `match` returns true wins.
 *     Adding a new mapping = appending one entry to the array (no switch fan-out).
 *   - Falls back to `{ label: entry.action, fallback: true }` so unmapped
 *     entries can still render the existing color-coded pill in the cell.
 *
 * Path normalization (internal):
 *   - Strip query string and trailing slash so `/api/cameras/?foo=bar`
 *     normalizes to `/api/cameras`.
 *   - UUID-shaped segments collapse to `:id` so `/api/cameras/<uuid>` and
 *     `/api/cameras/<other-uuid>/maintenance` share rule slots.
 */

export type AuditEntryShape = {
  method: string
  path: string
  action: string
  resource: string
  details?: Record<string, unknown> | null
}

export type DerivedLabel = {
  label: string
  fallback?: boolean
}

type Rule = {
  match: (entry: NormalizedEntry) => boolean
  build: (entry: NormalizedEntry) => string
}

type NormalizedEntry = AuditEntryShape & {
  /** Method upper-cased and path normalized to wildcard form (e.g. `POST /api/cameras/:id/start-stream`). */
  signature: string
  normalizedPath: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Allowlist of "meaningful" detail keys for the camera resource. Used by the
 * PATCH /api/cameras/:id rules to decide between "Renamed", "Changed stream
 * profile", and "Updated camera". Housekeeping keys outside this list (or
 * ones the interceptor sanitized to undefined) are ignored.
 */
const CAMERA_MEANINGFUL_KEYS = [
  "name",
  "streamProfileId",
  "streamUrl",
  "siteId",
  "ingestMode",
  "needsTranscode",
] as const

function normalizePath(path: string): string {
  // Strip query string.
  const noQuery = path.split("?")[0]
  // Strip trailing slash (but keep root `/` if that ever shows up).
  const trimmed =
    noQuery.length > 1 && noQuery.endsWith("/") ? noQuery.slice(0, -1) : noQuery
  // Collapse UUID segments to `:id`.
  return trimmed
    .split("/")
    .map((seg) => (UUID_RE.test(seg) ? ":id" : seg))
    .join("/")
}

function normalize(entry: AuditEntryShape): NormalizedEntry {
  const normalizedPath = normalizePath(entry.path)
  return {
    ...entry,
    normalizedPath,
    signature: `${entry.method.toUpperCase()} ${normalizedPath}`,
  }
}

function meaningfulCameraKeys(
  details: Record<string, unknown> | null | undefined,
): string[] {
  if (!details) return []
  return CAMERA_MEANINGFUL_KEYS.filter(
    (k) => Object.prototype.hasOwnProperty.call(details, k) && details[k] !== undefined,
  )
}

const RULES: Rule[] = [
  // 1. Start stream
  {
    match: (e) => e.signature === "POST /api/cameras/:id/start-stream",
    build: () => "Started stream",
  },
  // 2. Stop stream
  {
    match: (e) => e.signature === "POST /api/cameras/:id/stop-stream",
    build: () => "Stopped stream",
  },
  // 3. Start recording
  {
    match: (e) => e.signature === "POST /api/cameras/:id/start-recording",
    build: () => "Started recording",
  },
  // 4. Stop recording
  {
    match: (e) => e.signature === "POST /api/cameras/:id/stop-recording",
    build: () => "Stopped recording",
  },
  // 5. Maintenance ON
  {
    match: (e) =>
      e.signature === "PATCH /api/cameras/:id/maintenance" &&
      e.details?.enabled === true,
    build: () => "Toggled maintenance ON",
  },
  // 6. Maintenance OFF
  {
    match: (e) =>
      e.signature === "PATCH /api/cameras/:id/maintenance" &&
      e.details?.enabled === false,
    build: () => "Toggled maintenance OFF",
  },
  // 7. Rename — only `name` from the meaningful allowlist is present.
  {
    match: (e) => {
      if (e.signature !== "PATCH /api/cameras/:id") return false
      const keys = meaningfulCameraKeys(e.details)
      return keys.length === 1 && keys[0] === "name"
    },
    build: (e) => `Renamed → "${String(e.details?.name ?? "")}"`,
  },
  // 8. Change stream profile — only `streamProfileId` is present.
  {
    match: (e) => {
      if (e.signature !== "PATCH /api/cameras/:id") return false
      const keys = meaningfulCameraKeys(e.details)
      return keys.length === 1 && keys[0] === "streamProfileId"
    },
    build: () => "Changed stream profile",
  },
  // 9. Generic update — multiple meaningful keys present.
  {
    match: (e) => {
      if (e.signature !== "PATCH /api/cameras/:id") return false
      return meaningfulCameraKeys(e.details).length >= 2
    },
    build: () => "Updated camera",
  },
  // 10. Create camera
  {
    match: (e) => e.signature === "POST /api/cameras",
    build: () => "Created camera",
  },
  // 11. Delete camera
  {
    match: (e) => e.signature === "DELETE /api/cameras/:id",
    build: () => "Deleted",
  },
]

export function deriveActionLabel(entry: AuditEntryShape): DerivedLabel {
  const normalized = normalize(entry)
  for (const rule of RULES) {
    if (rule.match(normalized)) {
      return { label: rule.build(normalized) }
    }
  }
  return { label: entry.action, fallback: true }
}
