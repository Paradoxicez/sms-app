# Phase 07 Recordings -- Security Audit

**Audit Date:** 2026-04-13
**ASVS Level:** 1
**Auditor:** GSD Security Auditor (automated)

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-07-01 | Tampering | mitigate | CLOSED | `srs-callback.controller.ts:133` rejects `..` in segmentFile/m3u8File; `recordings.service.ts:191-200` rejects `..` and validates `SRS_HLS_PATH` prefix (defense in depth) |
| T-07-02 | Information Disclosure | mitigate | CLOSED | `recordings.controller.ts:30-31` applies `AuthGuard` + `FeatureGuard` at class level; all methods extract `orgId` from `cls.get('ORG_ID')`; service uses `TENANCY_CLIENT` for RLS |
| T-07-03 | Denial of Service | mitigate | CLOSED | `srs-callback.controller.ts:119-122` checks quota before archive; `recordings.service.ts:111-116` checks quota before startRecording; blocks at 100% (`usagePercent < 100` line 295); alerts at 80%/90% (lines 51-88) |
| T-07-04 | Information Disclosure | mitigate | CLOSED | `minio.service.ts:15-19` reads credentials from `ConfigService` (env vars only); per-org bucket isolation via `org-${orgId}` pattern (line 25); no credential exposure in frontend files |
| T-07-05 | Elevation of Privilege | mitigate | CLOSED | `recordings.controller.ts:30-31` class-level `AuthGuard` + `FeatureGuard`; schedule CRUD methods scope by `orgId` from CLS; `recordings.service.ts:313-356` queries filtered by `orgId` via tenancy client |
| T-07-06 | Denial of Service | accept | CLOSED | Accepted risk: retention processor runs hourly with per-org, per-camera iteration; worst case is slow cleanup, not system failure. See accepted risks log below. |
| T-07-07 | Tampering | mitigate | CLOSED | `create-schedule.dto.ts:3-12` Zod schema validates cameraId (uuid), scheduleType (enum), config (regex-validated times, bounded days array); `recordings.controller.ts:106` enforces `safeParse`; `schedule.processor.ts:26` reads only from trusted DB |
| T-07-08 | Spoofing | mitigate | CLOSED | `use-recordings.ts:4` and `schedule-dialog.tsx:6` use `apiFetch` which includes session cookie; backend `AuthGuard` + `FeatureGuard` enforce authentication on all endpoints |
| T-07-09 | Information Disclosure | mitigate | CLOSED | `recordings.controller.ts:30` class-level `AuthGuard` covers all endpoints; `recordings/page.tsx` uses `apiFetch` (authenticated); RLS via tenancy client ensures org-scoped data |
| T-07-10 | Tampering | mitigate | CLOSED | `recordings.controller.ts:106-109` validates schedule creation via `createScheduleSchema.safeParse(body)` (Zod); `create-schedule.dto.ts` enforces uuid, enum, regex, and bounded array constraints; frontend validation is convenience only |

## Accepted Risks Log

| Threat ID | Category | Risk Description | Justification |
|-----------|----------|------------------|---------------|
| T-07-06 | Denial of Service | Retention processor could be slow under high segment volume | Runs hourly with bounded iteration (per-org, per-camera). Worst case is delayed cleanup, not service disruption. Retry on next hourly cycle if MinIO deletion fails (retention.processor.ts:75). |

## Unregistered Flags

None. No `## Threat Flags` sections found in SUMMARY files (07-01, 07-02, 07-03).

## Summary

- **Threats Closed:** 10/10
- **Threats Open:** 0/10
- **Result:** SECURED
