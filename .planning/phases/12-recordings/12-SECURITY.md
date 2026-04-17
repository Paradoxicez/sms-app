# Phase 12 Recordings - Security Audit

**Audited:** 2026-04-17
**ASVS Level:** 1
**Auditor:** gsd-security-auditor

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-12-01 | Information Disclosure | mitigate | CLOSED | `recordings.service.ts:8` injects `TENANCY_CLIENT`; `findAllRecordings` (line 404) uses `this.prisma.recording.findMany` without explicit orgId -- RLS via `prisma-tenancy.extension.ts:16` sets `app.current_org_id` per query |
| T-12-02 | Tampering | mitigate | CLOSED | `recordings.controller.ts:32-33` applies `@UseGuards(AuthGuard, FeatureGuard)` + `@RequireFeature(FeatureKey.RECORDINGS)`; line 58 enforces max 100 limit; `bulkDeleteRecordings` (service line 436) delegates to `deleteRecording` which uses TENANCY_CLIENT-scoped Prisma |
| T-12-03 | Information Disclosure | mitigate | CLOSED | `recordings.controller.ts:246` calls `getRecordingWithSegments(id, orgId)` via TENANCY_CLIENT before presigned URL generation; `minio.service.ts:46` default expiry 14400s (4h), download endpoint uses 3600s (1h) per segment |
| T-12-04 | Spoofing | mitigate | CLOSED | `recording-query.dto.ts:6-8` validates cameraId/projectId/siteId as `z.string().uuid().optional()`; `recordings.controller.ts:45` runs `recordingQuerySchema.safeParse(query)` rejecting invalid input; TENANCY_CLIENT ensures cross-tenant isolation |
| T-12-05 | Denial of Service | mitigate | CLOSED | `recording-query.dto.ts:5` caps pageSize at `z.coerce.number().min(1).max(100)`; line 12 caps search at `z.string().max(200)` |
| T-12-06 | Information Disclosure | accept | CLOSED | Accepted risk: filter params (cameraId, status, date range) are non-sensitive metadata IDs; no PII exposed in URL query parameters |
| T-12-07 | Tampering | mitigate | CLOSED | `recordings.service.ts:436` iterates IDs calling `deleteRecording(id, orgId)` which at line 492 uses TENANCY_CLIENT-scoped `this.prisma.recording.findUnique` to verify org ownership before deletion; frontend (`recordings-data-table.tsx:323`) sends only selected row IDs |

## Accepted Risks

| Threat ID | Risk | Justification |
|-----------|------|---------------|
| T-12-06 | Filter parameters visible in URL (cameraId, status, date range) | These are opaque UUIDs and enum values, not PII. URL sharing does not leak sensitive data. Standard practice for server-side filtered tables. |

## Unregistered Flags

None. No `## Threat Flags` section found in 12-01-SUMMARY.md or 12-02-SUMMARY.md.
