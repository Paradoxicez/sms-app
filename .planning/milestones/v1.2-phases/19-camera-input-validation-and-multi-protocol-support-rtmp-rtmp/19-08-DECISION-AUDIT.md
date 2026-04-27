# Phase 19 / D-03 Audit — No Scheduled Re-probe / No Hybrid Pre-check

**Audited:** 2026-04-22
**Plan:** 19-08 Task 3

## D-03 restated

> No sync inline probe, no hybrid reachability pre-check, no scheduled re-probe. Two triggers total: on create, and on stream start.

Related decisions:
- **D-01** Probe on camera create
- **D-02** Probe on stream publish (on-publish callback)
- **D-06** Manual retry endpoint (user-initiated, NOT a scheduled trigger)
- **D-18** No hybrid reachability pre-check endpoint

## Enqueue call-site census (command A)

Command:
```bash
rg -n "probeQueue\.add|probe-camera" apps/api/src
```

Output:
```
apps/api/src/cameras/cameras.service.ts:190:        await this.probeQueue.add(
apps/api/src/cameras/cameras.service.ts:191:          'probe-camera',
apps/api/src/cameras/cameras.service.ts:487:          await this.probeQueue.add(
apps/api/src/cameras/cameras.service.ts:488:            'probe-camera',
apps/api/src/cameras/cameras.service.ts:541:        await this.probeQueue.add(
apps/api/src/cameras/cameras.service.ts:542:          'probe-camera',
apps/api/src/cameras/cameras.service.ts:571:        await this.probeQueue.add(
apps/api/src/cameras/cameras.service.ts:572:          'probe-camera',
```

4 call sites — all in `cameras.service.ts`, all within sanctioned methods:

| Line | Containing method | Trigger | Decision |
|------|-------------------|---------|----------|
| 190 | `createCamera` (L137) | On create (single) | D-01 |
| 487 | `bulkImport` (L359) | On create (bulk) | D-01 |
| 541 | `enqueueProbeFromSrs` (L519) | On-publish callback | D-02 |
| 571 | `enqueueProbeRetry` (L564) | User-initiated retry | D-06 |

`rg "probeQueue\.add" apps/api/src | wc -l` returns **4**, within the expected 3–5 range.

## Repeatable / cron audit (command B + C)

Command B:
```bash
rg -n "stream-probe.*repeat|repeat.*stream-probe|Cron.*probe" apps/api/src
```

Output: **EMPTY** — no repeatable-job, cron, or scheduled trigger references the stream-probe queue.

Command C:
```bash
rg -n "setInterval|setTimeout.*probe|cronExpression.*probe" apps/api/src
```

Output:
```
apps/api/src/recordings/bulk-download.service.ts:161:    setInterval(() => {
```

The only `setInterval` hit is in `bulk-download.service.ts` — a TTL cleanup for bulk-download zip files, entirely unrelated to the stream-probe queue.

## Camera-health audit (command D)

Command:
```bash
rg -n "camera-health.*probeQueue|probeQueue.*camera-health" apps/api/src
```

Output: **EMPTY** — Phase 15's camera-health processor does NOT enqueue probes. The two subsystems remain decoupled as D-03 requires.

## Conclusion

D-03 honored. Phase 19 introduced exactly the three trigger categories the decision permits:

- **Create** (D-01) — `createCamera`, `bulkImport`
- **On-publish** (D-02) — `enqueueProbeFromSrs`
- **Manual retry** (D-06) — `enqueueProbeRetry` (explicit user action, not a scheduled trigger)

No scheduled re-probe, no sync inline probe, no hybrid reachability pre-check snuck into the implementation. The rejected trigger patterns (repeat jobs, cron expressions, camera-health-driven probes) all return zero matches in the static audit.

The manual retry endpoint (D-06) is distinct from "scheduled re-probe" because it requires explicit user action — the system itself never schedules, re-schedules, or self-triggers a repeat probe.
