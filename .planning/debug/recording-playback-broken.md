---
status: awaiting_human_verify
trigger: "Recording playback not working — recordings page shows completed recordings but video playback fails when trying to view recorded footage."
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED — Two root causes addressed
test: All 34 recording tests pass, 2 web tests pass, no type errors introduced
expecting: User confirms recording playback works end-to-end
next_action: Await human verification

## Symptoms

expected: User can view recorded video footage from the Recordings page — click a completed recording and watch the playback via hls.js
actual: Recordings show as completed but playback doesn't work when trying to view them
errors: CORS failure when hls.js fetches MinIO presigned URLs cross-origin with withCredentials; HlsPlayer live-mode config incompatible with VOD manifest
reproduction: Open /app/recordings → select a completed recording → attempt playback
started: Phase 7 (Recordings) was built recently — playback may never have been fully tested end-to-end

## Eliminated

## Evidence

- timestamp: 2026-04-16T00:01:00Z
  checked: ManifestService.generateManifest() in manifest.service.ts
  found: Manifest generates presigned MinIO URLs (localhost:9000) for segment URIs in the m3u8
  implication: Browser fetches segments directly from MinIO which has no CORS config; withCredentials:true on hls.js XHR makes it worse

- timestamp: 2026-04-16T00:02:00Z
  checked: HlsPlayer component (hls-player.tsx)
  found: Configured with lowLatencyMode:true, liveSyncDurationCount:2, liveMaxLatencyDurationCount:5, backBufferLength:0 — all live-streaming settings
  implication: These settings conflict with VOD playback; hls.js in live mode expects live-edge segments not a static VOD playlist

- timestamp: 2026-04-16T00:03:00Z
  checked: RecordingsController has proxy endpoint GET /api/recordings/segments/:segmentId/proxy
  found: Proxy endpoint exists that streams segments from MinIO through the API with auth
  implication: Manifest should use proxy URLs instead of direct MinIO presigned URLs to avoid CORS and leverage existing auth

- timestamp: 2026-04-16T00:04:00Z
  checked: tenant-recordings-page.tsx (/app/recordings route)
  found: No playback functionality — just a list view linking to camera detail page
  implication: Playback only works via RecordingsTab on camera detail page; the recordings page itself has no player (not a bug per se, but user expectation may differ)

- timestamp: 2026-04-16T00:05:00Z
  checked: MinIO docker-compose config + .env.example
  found: MinIO endpoint is localhost:9000, no CORS configuration
  implication: Confirms presigned URLs from browser will fail with CORS error

## Resolution

root_cause: Two issues: (1) ManifestService generates presigned MinIO URLs (localhost:9000) in the m3u8 manifest — browser cannot fetch these cross-origin due to CORS + withCredentials. (2) HlsPlayer is configured for live streaming (lowLatencyMode, liveSyncDuration, etc.) which is incompatible with the VOD playlist type used by recording manifests.
fix: (1) Change manifest to use API proxy URLs (/api/recordings/segments/:segmentId/proxy) instead of presigned MinIO URLs. Also need init segment proxy endpoint. (2) Add VOD mode to HlsPlayer when used for recording playback.
verification: All 34 recording tests pass (6 test files), 2 web feature-gate tests pass, no new TypeScript errors introduced. Manifest test updated to assert proxy URLs instead of presigned URLs.
files_changed:
  - apps/api/src/recordings/manifest.service.ts
  - apps/api/src/recordings/recordings.controller.ts
  - apps/web/src/app/admin/cameras/components/hls-player.tsx
  - apps/web/src/app/admin/cameras/components/recordings-tab.tsx
  - apps/api/tests/recordings/manifest.test.ts
