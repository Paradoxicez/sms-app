# Phase 11 — Camera Management: Security Verification

**Audited:** 2026-04-17
**ASVS Level:** 1
**Threats Closed:** 9/9
**Status:** SECURED

## Threat Verification

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-11-01 | Elevation of Privilege | accept | Backend RLS enforces org scoping; no new endpoints created. Frontend uses `apiFetch` with session cookies for all CRUD (tenant-cameras-page.tsx:57-68, camera-form-dialog.tsx:154-165). |
| T-11-02 | Tampering | accept | React JSX auto-escapes all rendered values (camera name, streamUrl displayed via `{camera.name}`, `{camera.streamUrl}` in JSX). Backend zod validation assumed per existing architecture. No `dangerouslySetInnerHTML` usage found. |
| T-11-03 | Information Disclosure | accept | Stream URLs were already visible on prior camera detail page (now redirected). Form dialog displays streamUrl in standard `<Input>` element (camera-form-dialog.tsx:209). No new exposure surface. |
| T-11-04 | Spoofing | accept | Recording toggle uses `startRecording`/`stopRecording` from `use-recordings.ts` which call `apiFetch` with session cookies (tenant-cameras-page.tsx:110-123). Auth middleware + RLS enforced server-side. |
| T-11-05 | Denial of Service | mitigate | **maxBufferLength: 4** at camera-card.tsx:52. **backBufferLength: 0** at camera-card.tsx:53. **MAX_CONCURRENT = 6** at camera-card-grid.tsx:11, passed via `activePlayersRef` shared ref counter (camera-card.tsx:112 checks `activePlayersRef.current < maxConcurrent`). **Destroy on mouseleave** at camera-card.tsx:119-125 plus HLS instance cleanup at camera-card.tsx:70-73 (`hlsRef.current?.destroy()`). All four mitigation controls confirmed present. |
| T-11-06 | Information Disclosure | accept | Stream URLs already visible in existing HLS player component. Session-based playback tokens provide access control. HLS `xhrSetup` sends `withCredentials: true` (camera-card.tsx:58-60). |
| T-11-07 | Information Disclosure | accept | Stream URL visible in view-stream-sheet.tsx preview tab info grid. This is intentional -- URL copy feature present by design. Session-based playback tokens control access. |
| T-11-08 | Tampering | accept | AuditLogDataTable receives `apiUrl` prop with camera ID filter (view-stream-sheet.tsx:129). `apiFetch` sends session cookies; backend enforces org scoping via RLS. No new attack surface beyond existing audit log endpoint. |
| T-11-09 | Information Disclosure | accept | Camera detail pages replaced with `redirect()` to list page (admin/cameras/[id]/page.tsx:4, app/cameras/[id]/page.tsx:4). Standard Next.js redirect pattern, no sensitive information in redirect. |

## Accepted Risks Log

| Threat ID | Risk | Justification |
|-----------|------|---------------|
| T-11-01 | Camera CRUD without additional frontend auth check | Backend RLS + auth middleware is the authoritative control. Frontend is convenience layer only. |
| T-11-02 | XSS via camera name/streamUrl | React auto-escaping + backend zod validation. No raw HTML rendering. |
| T-11-03 | Stream URL visible in form | Already exposed in prior UI. No net-new disclosure. |
| T-11-04 | Recording endpoints accessible | Protected by existing session auth + RLS. No change in attack surface. |
| T-11-06 | HLS URL in network tab | Inherent to browser-based HLS playback. Session tokens mitigate unauthorized access. |
| T-11-07 | Stream URL copyable in sheet | Intentional feature. Access controlled by session tokens. |
| T-11-08 | Audit log query via apiUrl prop | Backend enforces org scoping. Client-side URL construction is convenience only. |
| T-11-09 | Redirect reveals route structure | Standard web pattern. No sensitive data in URL paths. |

## Unregistered Flags

None. No `## Threat Flags` sections found in SUMMARY files (11-01, 11-02, 11-03).
