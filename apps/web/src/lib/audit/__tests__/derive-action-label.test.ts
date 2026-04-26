/**
 * Unit tests for the audit-log Action-cell deriver.
 * See plan 260426-l5a (Activity-tab UX polish) Task 1.
 *
 * Each `it` corresponds to one row in the rule table. Order in this file
 * mirrors rule registration order in `derive-action-label.ts` so a failing
 * test points at the right rule index immediately.
 */
import { describe, it, expect } from "vitest"

import {
  deriveActionLabel,
  type AuditEntryShape,
} from "../derive-action-label"

const CAMERA_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

function entry(partial: Partial<AuditEntryShape>): AuditEntryShape {
  return {
    method: "GET",
    path: "",
    action: "update",
    resource: "camera",
    details: null,
    ...partial,
  }
}

describe("deriveActionLabel", () => {
  it("labels POST /api/cameras as 'Created camera'", () => {
    expect(
      deriveActionLabel(
        entry({ method: "POST", path: "/api/cameras", action: "create" }),
      ),
    ).toEqual({ label: "Created camera" })
  })

  it("labels DELETE /api/cameras/:id as 'Deleted'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "DELETE",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "delete",
        }),
      ),
    ).toEqual({ label: "Deleted" })
  })

  it("labels PATCH /api/cameras/:id/maintenance with enabled:true as 'Toggled maintenance ON'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}/maintenance`,
          action: "update",
          details: { enabled: true },
        }),
      ),
    ).toEqual({ label: "Toggled maintenance ON" })
  })

  it("labels PATCH /api/cameras/:id/maintenance with enabled:false as 'Toggled maintenance OFF'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}/maintenance`,
          action: "update",
          details: { enabled: false },
        }),
      ),
    ).toEqual({ label: "Toggled maintenance OFF" })
  })

  it("labels PATCH /api/cameras/:id with only name as 'Renamed → \"X\"'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { name: "Lobby Cam" },
        }),
      ),
    ).toEqual({ label: 'Renamed → "Lobby Cam"' })
  })

  it("labels PATCH /api/cameras/:id with only streamProfileId as 'Changed stream profile'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { streamProfileId: "profile-1" },
        }),
      ),
    ).toEqual({ label: "Changed stream profile" })
  })

  // quick 260426-nqr: 7 single-field rules + 1 multi-field regression guard.
  it("labels PATCH /api/cameras/:id with only tags as 'Updated tags'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { tags: ["outdoor", "entrance"] },
        }),
      ),
    ).toEqual({ label: "Updated tags" })
  })

  it("labels PATCH /api/cameras/:id with only description as 'Updated description'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { description: "Lobby south corner" },
        }),
      ),
    ).toEqual({ label: "Updated description" })
  })

  it("labels PATCH /api/cameras/:id with only location as 'Updated location'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { location: { lat: 13.7, lng: 100.5 } },
        }),
      ),
    ).toEqual({ label: "Updated location" })
  })

  it("labels PATCH /api/cameras/:id with only siteId as 'Moved to another site'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { siteId: "11111111-2222-3333-4444-555555555555" },
        }),
      ),
    ).toEqual({ label: "Moved to another site" })
  })

  it("labels PATCH /api/cameras/:id with only streamUrl as 'Updated stream URL'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { streamUrl: "rtsp://new-host/stream" },
        }),
      ),
    ).toEqual({ label: "Updated stream URL" })
  })

  it("labels PATCH /api/cameras/:id with needsTranscode:true as 'Toggled auto-transcode ON'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { needsTranscode: true },
        }),
      ),
    ).toEqual({ label: "Toggled auto-transcode ON" })
  })

  it("labels PATCH /api/cameras/:id with needsTranscode:false as 'Toggled auto-transcode OFF'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { needsTranscode: false },
        }),
      ),
    ).toEqual({ label: "Toggled auto-transcode OFF" })
  })

  it("labels PATCH /api/cameras/:id with multiple new fields (tags + description) as 'Updated camera' (multi-field fallback preserved)", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { tags: ["a"], description: "b" },
        }),
      ),
    ).toEqual({ label: "Updated camera" })
  })

  it("labels PATCH /api/cameras/:id with multiple fields as 'Updated camera'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "PATCH",
          path: `/api/cameras/${CAMERA_UUID}`,
          action: "update",
          details: { name: "Lobby Cam", streamProfileId: "profile-1" },
        }),
      ),
    ).toEqual({ label: "Updated camera" })
  })

  it("labels POST /api/cameras/:id/start-stream as 'Started stream'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "POST",
          path: `/api/cameras/${CAMERA_UUID}/start-stream`,
          action: "create",
        }),
      ),
    ).toEqual({ label: "Started stream" })
  })

  it("labels POST /api/cameras/:id/stop-stream as 'Stopped stream'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "POST",
          path: `/api/cameras/${CAMERA_UUID}/stop-stream`,
          action: "create",
        }),
      ),
    ).toEqual({ label: "Stopped stream" })
  })

  it("labels POST /api/cameras/:id/start-recording as 'Started recording'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "POST",
          path: `/api/cameras/${CAMERA_UUID}/start-recording`,
          action: "create",
        }),
      ),
    ).toEqual({ label: "Started recording" })
  })

  it("labels POST /api/cameras/:id/stop-recording as 'Stopped recording'", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "POST",
          path: `/api/cameras/${CAMERA_UUID}/stop-recording`,
          action: "create",
        }),
      ),
    ).toEqual({ label: "Stopped recording" })
  })

  it("returns fallback {label: action, fallback: true} for any other endpoint (e.g. POST /api/projects)", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "POST",
          path: "/api/projects",
          action: "create",
          resource: "project",
        }),
      ),
    ).toEqual({ label: "create", fallback: true })
  })

  it("treats trailing slash and query strings as equivalent (POST /api/cameras/?foo=bar → Created camera)", () => {
    expect(
      deriveActionLabel(
        entry({
          method: "POST",
          path: "/api/cameras/?foo=bar",
          action: "create",
        }),
      ),
    ).toEqual({ label: "Created camera" })
  })
})
