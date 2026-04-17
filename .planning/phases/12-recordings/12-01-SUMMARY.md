---
phase: 12-recordings
plan: 01
subsystem: recordings-api-shared-utils
tags: [backend, api, recordings, shared-components, frontend-utils]
dependency_graph:
  requires: []
  provides: [cross-camera-query-endpoint, bulk-delete-endpoint, download-endpoint, format-utils, recording-status-badge]
  affects: [recordings-controller, recordings-service, tenant-recordings-page, recordings-tab]
tech_stack:
  added: []
  patterns: [cross-camera-prisma-join, bigint-conversion, presigned-url-download, shared-utility-extraction]
key_files:
  created:
    - apps/api/src/recordings/dto/recording-query.dto.ts
    - apps/api/tests/recordings/cross-camera-list.test.ts
    - apps/api/tests/recordings/bulk-delete.test.ts
    - apps/api/tests/recordings/download.test.ts
    - apps/web/src/lib/format-utils.ts
    - apps/web/src/components/recording-status-badge.tsx
  modified:
    - apps/api/src/recordings/recordings.controller.ts
    - apps/api/src/recordings/recordings.service.ts
    - apps/web/src/components/pages/tenant-recordings-page.tsx
    - apps/web/src/app/admin/cameras/components/recordings-tab.tsx
decisions:
  - "BigInt totalSize converted to Number via map in findAllRecordings response"
  - "Bulk delete processes sequentially via existing deleteRecording to ensure MinIO cleanup"
  - "Download endpoint returns presigned URL for init segment with 4-hour expiry"
  - "formatDuration in shared utils includes seconds display (more detailed than recordings-tab version)"
metrics:
  duration: 259s
  completed: "2026-04-17T14:15:08Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 4
  tests_added: 17
---

# Phase 12 Plan 01: Backend API Endpoints + Shared Frontend Utilities Summary

Cross-camera query endpoint with Prisma joins (Camera > Site > Project), bulk delete with partial failure handling, presigned MinIO download URL, and shared formatDuration/formatSize/RecordingStatusBadge extracted from duplicate inline definitions.

## Task Results

### Task 1: Backend cross-camera query endpoint + bulk delete endpoint + DTO
**Commit:** `dcc9fec`
**Status:** Complete

- Created `recording-query.dto.ts` with Zod schema validating page, pageSize, cameraId, projectId, siteId, startDate, endDate, status, search
- Added `findAllRecordings` method to service with 3-level Prisma join (camera > site > project), BigInt-to-Number conversion for totalSize, and server-side pagination
- Added `bulkDeleteRecordings` method that processes deletions sequentially via existing `deleteRecording` (ensures MinIO cleanup), returns `{ deleted, failed }` counts
- Added `GET /api/recordings` endpoint (placed before `:id` routes) with Zod validation
- Added `DELETE /api/recordings/bulk` endpoint (placed before `:id` route) with array validation and 100-item limit
- Created 13 tests across 2 test files (9 cross-camera, 4 bulk-delete)

### Task 2: Download endpoint + shared frontend utilities
**Commit:** `dc97fe7`
**Status:** Complete

- Added `GET /api/recordings/:id/download` endpoint returning `{ url }` with presigned MinIO URL (4-hour expiry)
- Created `format-utils.ts` with shared `formatDuration` and `formatSize` functions
- Created `recording-status-badge.tsx` with shared `RecordingStatusBadge` component (complete/recording/processing/error states)
- Updated `tenant-recordings-page.tsx` to import from shared modules, removed inline duplicates
- Updated `recordings-tab.tsx` to import from shared modules, removed inline duplicates
- Created 4 download tests
- TypeScript compilation clean (no errors)

## Verification Results

- 17 new tests passing (9 cross-camera-list + 4 bulk-delete + 4 download)
- All pre-existing recording tests still pass (38/39 total -- 1 pre-existing manifest version test failure unrelated to changes)
- TypeScript compilation: zero errors
- Route ordering verified: `@Get()` before `@Get(':id...')`, `@Delete('bulk')` before `@Delete(':id')`

## Deviations from Plan

None -- plan executed exactly as written.

## Pre-existing Issues

**manifest.test.ts line 37:** Test expects `#EXT-X-VERSION:7` but ManifestService generates version 3. This is a pre-existing test failure unrelated to Phase 12 changes.

## Self-Check: PASSED

All 6 created files verified on disk. Both commit hashes (dcc9fec, dc97fe7) confirmed in git log.
