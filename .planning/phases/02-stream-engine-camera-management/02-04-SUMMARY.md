---
phase: 02-stream-engine-camera-management
plan: 04
status: completed
started: "2026-04-09T13:23:39Z"
completed: "2026-04-09T13:28:56Z"
duration: 317s
commits:
  - 9d8baef
  - 3636284
tasks_completed: 2
tasks_total: 2
subsystem: api
tags: [stream-profiles, settings, srs-config, hls, zod]

dependency-graph:
  requires:
    - "Phase 2 Prisma models (StreamProfile, OrgSettings, SystemSettings) from 02-01"
    - "SrsApiService.reloadConfig() from 02-03"
    - "AuthGuard from 02-02"
    - "SuperAdminGuard from Phase 1"
  provides:
    - "StreamProfileService with CRUD + validation for custom stream profiles"
    - "SettingsService with system settings, org settings, and srs.conf generation"
    - "Stream engine config regeneration with SRS reload"
  affects:
    - "02-05 (bulk import may assign default stream profiles)"
    - "02-06 (internal preview uses stream engine config)"

tech-stack:
  added: []
  patterns:
    - "srs.conf template generation from DB settings"
    - "Two-tier settings: SuperAdminGuard for system, AuthGuard for org"
    - "Stream profile validation with warnings (not blocking)"

key-files:
  created:
    - apps/api/src/streams/stream-profile.service.ts
    - apps/api/src/streams/stream-profile.controller.ts
    - apps/api/src/streams/dto/create-stream-profile.dto.ts
    - apps/api/src/streams/dto/update-stream-profile.dto.ts
    - apps/api/src/settings/settings.service.ts
    - apps/api/src/settings/settings.controller.ts
    - apps/api/src/settings/settings.module.ts
    - apps/api/src/settings/dto/update-system-settings.dto.ts
    - apps/api/src/settings/dto/update-org-settings.dto.ts
    - apps/api/tests/streams/profile-builder.test.ts
    - apps/api/tests/settings/stream-engine.test.ts
    - apps/api/tests/srs/config-generator.test.ts
  modified:
    - apps/api/src/streams/streams.module.ts
    - apps/api/src/app.module.ts

key-decisions:
  - "Stream profile validation returns warnings array (not blocking) for high-res/bitrate/fps"
  - "System settings auto-create defaults on first access (findFirst + create pattern)"
  - "srs.conf generated from template literal with conditional hls_keys block"
  - "SuperAdminGuard on system settings, AuthGuard on org settings (T-02-12 mitigation)"

patterns-established:
  - "Settings auto-create: findFirst/findUnique, create if null, return"
  - "Config generation: template literal with conditional blocks, write + reload"

requirements-completed: [STREAM-05, STREAM-07]

metrics:
  duration: 317s
  completed: 2026-04-09
---

# Phase 02 Plan 04: Stream Profiles & Settings Summary

Stream profile CRUD with codec/resolution/FPS/bitrate validation, system-level stream engine settings with srs.conf generation and SRS reload, per-org defaults with auto-start and reconnect config.

## Objective

Enable operators to define custom stream profiles and admins to configure the streaming engine through the web UI, with srs.conf regeneration and SRS hot-reload on settings changes.

## What Was Built

### Task 1: Stream Profile CRUD with Validation
- `StreamProfileService` with create, findAll, findById, update, delete, validate methods
- `StreamProfileController` with POST/GET/PATCH/DELETE at `/api/stream-profiles`
- `CreateStreamProfileSchema` with codec enum (auto/copy/libx264), preset, resolution, fps, bitrate, audio settings
- `UpdateStreamProfileSchema` with all fields optional for partial updates
- Default profile toggling: setting isDefault=true unsets other profiles' isDefault
- Validation endpoint (`POST /api/stream-profiles/validate`) returns warnings for high resolution (>1080p), high bitrate (>8000k), high fps (>30)
- 19 tests covering schema validation, service CRUD, default toggling, validation warnings

### Task 2: Stream Engine Settings + srs.conf Generation + Reload
- `SettingsService` with getSystemSettings, updateSystemSettings, getOrgSettings, updateOrgSettings
- `generateSrsConfig()` produces complete srs.conf with HLS config, 6 HTTP callbacks, WebRTC
- Conditional `hls_keys` block included only when hlsEncryption=true
- `regenerateAndReloadSrs()` writes config file and calls SrsApiService.reloadConfig()
- `SettingsController` with SuperAdminGuard on system endpoints, AuthGuard on org endpoints
- Zod validation constrains all settings within safe bounds (ports 1024-65535, hlsFragment 1-10, etc.)
- `SettingsModule` registered in AppModule with SrsModule import
- 21 tests covering schema validation, service CRUD, config generation, encryption toggle

## Threat Mitigations Applied

| Threat ID | Mitigation | Implementation |
|-----------|-----------|----------------|
| T-02-11 | System settings tampering | SuperAdminGuard on system endpoints, Zod port range validation (1024-65535), HLS bounds (1-10, 5-120) |
| T-02-12 | Org admin accessing system settings | SuperAdminGuard on /admin/settings/*, AuthGuard + CLS org context on /settings/org |
| T-02-13 | DoS via extreme config values | Zod validation: hlsFragment (1-10), hlsWindow (5-120), timeoutSeconds (5-300) |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all services are fully implemented with complete business logic.

## Self-Check: PASSED

All 12 created files verified on disk. Both commits verified in git log (9d8baef, 3636284). 40 tests passing across 3 test files.
