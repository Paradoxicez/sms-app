---
phase: 19
slug: camera-input-validation-and-multi-protocol-support-rtmp-rtmp
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web) + jest (api via NestJS default) |
| **Config file** | `apps/api/jest.config.js`, `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @sms/api test -- --findRelatedTests <files>` (api) / `pnpm --filter @sms/web test -- --run <path>` (web) |
| **Full suite command** | `pnpm test` (monorepo root runs all package tests) |
| **Estimated runtime** | ~90 seconds (full suite across api + web) |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the files touched in that task
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> Populated by gsd-planner once PLAN.md task IDs are assigned. Rows below are the validation dimensions the planner MUST map onto concrete tasks.

| Dimension | Intended Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-----------|---------------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| zod refine rejects non-allowed protocols (http, ftp, file, javascript) | 01 (DTO allowlist) | 0 | D-12, D-17 | T-19-01 | `createCamera`/`bulkImport` return 400 with field-level error when URL scheme not in `rtsp\|srt\|rtmp\|rtmps` | unit | `pnpm --filter @sms/api test create-camera.dto.spec.ts` | ❌ W0 | ⬜ pending |
| protocol-branch omits `-rtsp_transport tcp` for rtmp/rtmps/srt URLs | 02 (FFmpeg/ffprobe branching) | 1 | D-13 | — | ffprobe command array does not include the flag when URL scheme ≠ rtsp | unit | `pnpm --filter @sms/api test ffprobe.service.spec.ts` | ❌ W0 | ⬜ pending |
| probe enqueue on `createCamera` is idempotent via `probe:{cameraId}` jobId | 03 (probe wiring) | 1 | D-01, D-04 | — | Rapid double-create of same camera results in at most one running probe job | integration | `pnpm --filter @sms/api test stream-probe.processor.integration.spec.ts` | ❌ W0 | ⬜ pending |
| probe refresh on stream start (on_publish) overwrites codecInfo with SRS ground truth | 04 (on_publish refresh) | 1 | D-02 | — | StreamProcessor running-transition call writes `{status: 'success', video, audio, probedAt}` | integration | `pnpm --filter @sms/api test stream.processor.on-publish.spec.ts` | ❌ W0 | ⬜ pending |
| Prisma `@@unique([orgId, streamUrl])` migration applies against existing-dup fixture | 05 (schema + dedup) | 2 | D-10c, D-11 | T-19-02 | Pre-constraint dedup SQL runs; keep-oldest retains one row per (orgId, streamUrl) | migration | `pnpm --filter @sms/api prisma:test-migrate` | ❌ W0 | ⬜ pending |
| P2002 translates to `DuplicateStreamUrlError` at service layer | 05 | 2 | D-11 | T-19-02 | Forcing race returns 409 with `code: "DUPLICATE_STREAM_URL"` | unit | `pnpm --filter @sms/api test cameras.service.duplicate.spec.ts` | ❌ W0 | ⬜ pending |
| bulk-import `validateRow` flags within-file duplicates with 3rd icon + skip-with-warning | 06 (bulk-import UI) | 3 | D-08, D-10a, D-16 | — | CSV with 3 duplicate rows renders "N valid, M duplicate" counter; Import button enabled; confirm toast says imported/skipped split | component | `pnpm --filter @sms/web test bulk-import-dialog.spec.tsx` | ❌ W0 | ⬜ pending |
| CodecStatusCell renders pending/failed/success/none per state + retry on failed | 07 (codec column) | 3 | D-05, D-06, D-07 | — | Storybook + snapshot: four visual states; retry click re-enqueues probe via mocked API | component | `pnpm --filter @sms/web test codec-status-cell.spec.tsx` | ❌ W0 | ⬜ pending |
| Camera form dialog live prefix validation mirrors backend refine | 08 (camera-form-dialog) | 3 | D-15 | — | Typing `http://x` disables Submit and shows inline error; typing `rtmp://host/s` enables Submit | component | `pnpm --filter @sms/web test camera-form-dialog.spec.tsx` | ❌ W0 | ⬜ pending |
| StreamProbeProcessor guards against empty/undefined cameraId job data | 03 (probe wiring) | 1 | Defensive (MEMORY.md) | — | Job with empty data is rejected/logged, no throw, no DB write | unit | `pnpm --filter @sms/api test stream-probe.processor.guard.spec.ts` | ❌ W0 | ⬜ pending |
| `rtspUrl → inputUrl` rename: no remaining `rtspUrl` references in `apps/api/src` | 09 (rename) | 4 | D-14 | — | `grep -r "rtspUrl" apps/api/src \| wc -l` returns 0 | static | `rg "rtspUrl" apps/api/src` | ❌ W0 | ⬜ pending |
| normalizeCodecInfo read-side helper converts legacy `{}` and `{ error }` shapes to new tagged shape | 07 (codec rendering) | 3 | D-07 | — | Fixture with `{}` yields `{status: 'none'}`; `{error}` yields `{status: 'failed', error}` | unit | `pnpm --filter @sms/api test normalize-codec-info.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Tests listed above do not exist yet. Wave 0 creates empty-but-runnable spec files and shared fixtures so later waves can hit green commits incrementally.

- [ ] `apps/api/src/cameras/dto/create-camera.dto.spec.ts` — protocol allowlist cases
- [ ] `apps/api/src/cameras/dto/bulk-import.dto.spec.ts` — DTO parity cases (D-17)
- [ ] `apps/api/src/cameras/ffprobe.service.spec.ts` — protocol branch cases
- [ ] `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.spec.ts` — protocol branch cases
- [ ] `apps/api/src/streams/processors/stream-probe.processor.integration.spec.ts` — idempotency + undefined-cameraId guard
- [ ] `apps/api/src/streams/processors/stream.processor.on-publish.spec.ts` — refresh-on-running trigger
- [ ] `apps/api/src/cameras/cameras.service.duplicate.spec.ts` — P2002 translation + pre-insert dedup
- [ ] `apps/api/prisma/test/migrate-existing-dups.spec.ts` — migration runs green against dup fixture
- [ ] `apps/api/src/cameras/codec-info/normalize-codec-info.spec.ts` — legacy shape migration
- [ ] `apps/web/src/components/cameras/__tests__/bulk-import-dialog.spec.tsx`
- [ ] `apps/web/src/components/cameras/__tests__/codec-status-cell.spec.tsx`
- [ ] `apps/web/src/components/cameras/__tests__/camera-form-dialog.spec.tsx`
- [ ] `apps/api/src/test-utils/duplicate-fixtures.ts` — shared fixture data for duplicates

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live RTMP ingest via FFmpeg pipeline end-to-end | D-12 | Requires a real RTMP source or ffmpeg test-pattern publisher; CI has no camera simulator | 1) Start SRS + API locally. 2) `ffmpeg -re -f lavfi -i testsrc=size=640x360:rate=30 -c:v libx264 -f flv rtmp://localhost:1935/live/testcam`. 3) Register the camera via dashboard with `rtmp://localhost:1935/live/testcam`. 4) Verify codec column transitions pending → success within 5s. |
| Live RTMPS ingest end-to-end | D-12 | Requires RTMPS-capable encoder and TLS cert setup | Same as RTMP but with `rtmps://` source. Confirm that the FFmpeg pipeline pulls and pushes without error. |
| Duplicate-cleanup migration against real prod dataset | D-10c | Keep-oldest heuristic impact cannot be fully modeled in fixtures | Run migration on a staging DB restored from prod snapshot. Compare pre/post row counts; verify no org lost all of its cameras for a given URL. |
| Amber failed-state tooltip copy readability | D-05 | Subjective UX judgement | Trigger probe failure with an unreachable URL, hover the amber icon, confirm tooltip text fits the existing minimal UI tone. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
