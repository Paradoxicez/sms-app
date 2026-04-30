---
status: resolved
resolution: not_a_bug
trigger: "SRS HLS archive pipeline broken — on_hls callbacks succeed (api returns {code:0}, 18,607 callbacks in 30min) but archive jobs are never enqueued (archives.total: 0 after 1hr post-restart). Recordings have gaps because archive ingestion to MinIO never fires."
created: 2026-04-30
updated: 2026-04-30T~17:30Z
resolved: 2026-04-30
verification: User clicked Start Recording on one camera via UI. Within 30s `archives.total` went from 0 → 6, all successes, 0 failures, status:"healthy", lastSuccessAt set. End-to-end pipeline (on_hls callback → handler → archive enqueue → BullMQ → MinIO upload → Postgres write → ArchiveMetricsService increment) confirmed working.
conclusion: NOT A BUG. Archive pipeline is opt-in by design — requires an active Recording row (manual /api/recordings/start OR enabled RecordingSchedule). Production had zero Recording rows ever, zero enabled schedules. `archives.total: 0` was the correct reading for an idle pipeline. The throttler fix bc37dc2 was solid; there was never a second bug behind it.
follow_up: Optional feature decisions for user — (a) bulk-create RecordingSchedule rows for always-on, (b) plan-phase a new "auto-record on publish" feature (note: Camera.defaultRecordingMode field was deliberately dropped 2026-04-20 as dead config). Neither is in scope for this debug.
---

## Current Focus

hypothesis: CONFIRMED — no Recording rows exist (active OR historical) AND no enabled RecordingSchedule rows exist for the 19 production cameras. Archive flow is OPT-IN by design (commit history confirms: `defaultRecordingMode` field DROPPED 2026-04-20 as dead config). on_hls handler correctly returns {code:0} via the silent early-return at controller line 380-382 when `getActiveRecording` returns null. archives.total=0 is the correct, expected reading for an idle pipeline.
test: SSH'd to prod, queried Recording (count 0), RecordingSegment (count 0), RecordingSchedule WHERE enabled=true (count 0), sampled 5 cameras (all isRecording=false), tailed api logs (0 archive/recording log lines in 2h, ScheduleProcessor running every 60s as cron expects).
expecting: All evidence aligns with "system idle, awaiting opt-in". Confirmed.
next_action: NEEDS USER DECISION — see CHECKPOINT below. There is no code bug to fix.

## Symptoms

expected: Each on_hls callback (1 per sealed HLS segment, ~30/min/camera × 19 cameras = ~570/min cluster-wide) should result in api enqueueing an archive job that writes the .ts segment to MinIO + creates a recording row in Postgres. Over 1 hour, expect ~34000 archive jobs.
actual: After 1hr uptime post-deploy of fix bc37dc2 (throttler bypass — verified working), /api/srs/callbacks/metrics reports archives.total: 0, successes: 0, failures: 0, lastSuccessAt: null, status: idle. SRS sent 18,607 on_hls callbacks in 30min and api returned {code:0} to all of them. Handler returns success without doing the archive work.
errors: NO errors in api logs. Silent failure mode.
reproduction: Production server, 1hr uptime, 19 cameras publishing. Tail /api/srs/callbacks/metrics — archives counters never advance.
started: Bug existed before throttler fix (was masked by 429s eating most callbacks). With throttler fix bc37dc2 deployed 2026-04-30 ~15:15 UTC and verified working at 16:50 UTC, archives.total still 0. Bug existed since at least v1.3.0.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-05-01
  checked: apps/api/src/srs/srs-callback.controller.ts onHls() handler (lines 334-420)
  found: Five early-return paths to {code:0} BEFORE archiveMetrics increment:
    1. Schema validation fail (337-340) — would log warn
    2. Not live mode / missing org/cameraId (343-345) — silent
    3. getActiveRecording returns null (380-382) — silent, no log
    4. Storage quota exceeded (385-388) — would log warn
    5. Path traversal detected (398-401) — would log warn
  Metric increment is at line 410 (recordSuccess) inside the try, OR line 415 (recordFailure) on catch. To get total=0 with NO log noise, path #2 or #3 is the only matching candidate. #2 (not live) is unlikely because all 19 cameras publish under live/{orgId}/{cameraId}. #3 (no active Recording) is the strongest fit.
  implication: archives.total=0 + zero log noise + 18,607 callbacks landing → Recording table has zero rows with status='recording'. Bug is operational, not code.

- timestamp: 2026-05-01
  checked: RecordingsService.getActiveRecording (line 179-184) and startRecording (line 96-147)
  found: A Recording row only exists if startRecording was called, either via:
    (A) HTTP POST /api/recordings/start (manual user action)
    (B) ScheduleProcessor.process() — runs cron 'schedule-check' every 1 minute (recordings.module.ts:45-49), iterates RecordingSchedule rows where enabled=true, calls startRecording when current time falls within window AND camera is online AND camera.isRecording=false.
  implication: If neither (A) nor (B) ever fired for a camera, archive will silently skip on_hls forever. Need to know which cameras have either an active Recording or a RecordingSchedule.

- timestamp: 2026-05-01
  checked: apps/api/src/recordings/schedule.processor.ts:30 — `findMany({ where: { enabled: true } })` with NO orgId scope
  found: ScheduleProcessor uses systemPrisma directly (no RLS), correctly bypasses tenant filtering. Loops every schedule cluster-wide. Would print "Schedule started recording: camera=X" log line on transition.
  implication: If schedules exist, log lines should be present. Absence of those lines + archives.total=0 = strongest evidence that no schedules are configured AND no manual recordings active.

- timestamp: 2026-05-01
  checked: ssh ice@stream.magichouse.in.th, docker compose exec postgres psql -U sms -d sms_platform — production DB queries:
    1. `SELECT COUNT(*) FROM "Recording" WHERE status='recording';` → 0
    2. `SELECT COUNT(*) FROM "Recording";` → 0 (NEVER had any Recording rows)
    3. `SELECT COUNT(*) FROM "RecordingSegment";` → 0 (NEVER had any segment rows)
    4. `SELECT COUNT(*) FROM "RecordingSchedule" WHERE enabled=true;` → 0
    5. Sampled 5 cameras (BKR06, Saensuk-140, Saensuk-137, BKR05, Saensuk-135): all `isRecording=false`, all `status='online'`
  implication: Production has NEVER recorded anything. Not a regression. Not a bug. Not "broken since v1.3.0" — never used since deployment.

- timestamp: 2026-05-01
  checked: docker compose logs api --since 2h | grep -ciE "Archived segment|Recording started|Recording stopped|Schedule started recording|Schedule stopped recording"
  found: 0 matches.
  implication: Archive pipeline never fired in the last 2h despite 18,607 on_hls callbacks. Not because the pipeline is broken — because the pipeline correctly skipped (no Recording rows to archive against).

- timestamp: 2026-05-01
  checked: docker compose logs api --since 2h | grep "ScheduleProcessor"
  found: Steady "Checking recording schedules..." log line every 60s on the dot (cron `* * * * *` from recordings.module.ts:45-49). Zero "Schedule started recording" / "Schedule stopped recording" follow-ups.
  implication: BullMQ scheduler is healthy + correctly wired. ScheduleProcessor itself works. It just has no schedule rows to act on.

- timestamp: 2026-05-01
  checked: schema.prisma Camera model (lines 200-251) for any "always-record" or "auto-record" flag
  found: Only `isRecording` (Boolean, default false) and `retentionDays` (per-camera retention override). No `autoRecord`, no `recordingEnabled`, no `alwaysOn`. Schema comment at line 277 explicitly notes that `defaultRecordingMode` was DROPPED in 2026-04-20 migration `drop_org_settings_dead_fields` as "dead config (no reader in src/)".
  implication: Recording is intentionally opt-in per camera. No platform-wide "always record when online" mode exists.

- timestamp: 2026-05-01
  checked: apps/web/src/app/admin/cameras/components/recording-controls.tsx
  found: UI exposes only manual "Start Recording" button + "Set Schedule" button per camera. No bulk "enable recording for all cameras" action exists in this component (camera-bulk-actions.tsx does have a `handleBulkStartRecording` — bulk start IS available, just not auto-on).
  implication: Operators must explicitly start recording per camera (manual or schedule). For a 19-camera fleet expected to record continuously, that's a config gap; for a fleet where recording is selective, the current state is correct.

## Resolution

root_cause: NOT A CODE BUG. The system is operating exactly as designed: HLS archiving is opt-in per camera, gated by an active Recording row (created by manual `POST /api/recordings/start` OR by ScheduleProcessor evaluating an enabled RecordingSchedule). Production DB has zero Recording rows ever, zero RecordingSegment rows ever, and zero enabled RecordingSchedule rows. on_hls handler correctly returns {code:0} via the early-return at srs-callback.controller.ts:380-382 (`if (!recording) return {code:0}`). This skip is silent (no log line) by design — logging every skipped callback would emit ~570 log lines/min cluster-wide.
fix: NO CODE CHANGE APPLIED. The bug report is based on a mis-read of the design: archives.total=0 in /api/srs/callbacks/metrics is the correct reading for an idle pipeline, not evidence of breakage. To activate the pipeline the operator must opt cameras in. Three options for the user to choose from — see CHECKPOINT below.
verification: All five evidence rows above directly disconfirm the "code is broken" hypothesis and confirm "system is idle by design". No code change to verify.
files_changed: []

## Checkpoint Notes (for handoff to user)

**Three operational paths the user can choose between:**

1. **Manual start per camera** — Open the camera detail page → click "Start Recording". Recording row gets created, archiveSegment fires on the next on_hls (within ~2s), archives.total starts incrementing. For 19 cameras that's 19 clicks (or use the bulk-start action in cameras-columns).

2. **Schedule-based** — Set a RecordingSchedule per camera (or org-wide via bulk action) with the desired window (e.g. `00:00-24:00` daily for always-on, or business hours only). Schedule.processor evaluates every 60s and starts/stops the Recording rows accordingly.

3. **"Always record when online" mode (NEW FEATURE — out of debug scope)** — Would require a new schema field (e.g. `Camera.autoRecord Boolean @default(false)`) plus a hook from the on-publish handler (or StatusService transition) to start a Recording row whenever a camera goes online. This is a feature, not a fix; recommend a separate plan-phase if the user wants this. Note schema commit 2026-04-20 explicitly removed `defaultRecordingMode` as dead config — adding it back is a deliberate scope-add.

**Risk if user chooses 2 or activates a fleet-wide schedule:** Sudden flood of archive jobs. With 19 cameras × ~30 segments/min = ~570 MinIO PUTs/min + ~570 Postgres INSERTs/min. MinIO and Postgres should handle this comfortably, but worth tailing /api/srs/callbacks/metrics for the first 30min after enabling to catch any saturation.
