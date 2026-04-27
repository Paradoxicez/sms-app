# Phase 23: Tech Debt Cleanup + Phase 0 Prerequisites - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `23-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 23-tech-debt-cleanup-phase-0-prerequisites
**Mode:** discuss (interactive)
**Areas discussed:** DEBT-05 (migration baseline), DEBT-02 (test triage), DEBT-01 (guard metric), CI gate ownership
**Areas defaulted (not discussed):** DEBT-03 (hls_use_fmp4 fix), DEBT-04 (recording metadata layout)

---

## Gray Area Selection (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| DEBT-05 baseline strategy | 8 hand-rolled SQL → Prisma migrations: squash / preserve / hybrid | ✓ |
| DEBT-02 test triage | 23 failing tests — fix all / skip-with-issue / delete-and-fix; format of skip | ✓ |
| DEBT-01 metric + DLQ | Guard pattern — return+metric / throw+DLQ / Prometheus vs ArchiveMetricsService | ✓ |
| CI gate ownership | Phase 23 creates `.github/workflows/test.yml` + branch protection vs defer to Phase 28 | ✓ |

**Notes:** User selected all 4 gray areas. DEBT-03 and DEBT-04 deferred to defaults (Claude's discretion, with user confirmation in the final gate).

---

## DEBT-05: Migration baseline strategy

### Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Squash เป็น initial เดียว (Recommended) | `prisma migrate diff --from-empty --to-schema` + RLS appended into one `0_init` migration | ✓ |
| Preserve history ลำดับ | 8 chronological migrations | |
| Hybrid | 1 init + small follow-ups | |

**User's choice:** Squash. Rationale: easier review, no production DB exists yet so history granularity is moot, RLS lives in the same file as schema for atomic apply.

### Dev DB handling

| Option | Description | Selected |
|--------|-------------|----------|
| Drop + รัน migrate deploy ใหม่ (Recommended) | Replace `db:push` with `prisma migrate reset`; dev = throwaway | ✓ |
| Keep `migrate resolve` escape hatch | Add `db:baseline` script for edge cases | |
| Both | Default = reset; keep baseline for rare cases | |

**User's choice:** Drop + reset. Clean break — no escape hatch.

### Drift verification

| Option | Description | Selected |
|--------|-------------|----------|
| CI step + manual one-time (Recommended) | `db:check-drift` script, run once locally + every CI push | ✓ |
| Manual only | One-time check, no CI step | |
| CI step รวมใน Phase 28 | Phase 23 manual; CI workflow ในเฟส 28 | |

**User's choice:** CI step + manual. The `db:check-drift` npm script lives in Phase 23 along with the `test.yml` workflow.

---

## DEBT-02: Test triage philosophy

**Discovery during discussion:** Running `pnpm --filter @sms-platform/api test` showed `108 passed, 11 skipped, 121 todo, 0 failures`. The "23 failing tests" referenced in research/REQUIREMENTS reflected an earlier snapshot. The actual gray area shifted from "how to fix 23 failures" to "what to do with 121 `it.todo` placeholders + how to gate CI".

### Todo handling

| Option | Description | Selected |
|--------|-------------|----------|
| Leave as-is (Recommended) | `it.todo` doesn't fail CI; track 121 in backlog; v1.4 fills incrementally | ✓ |
| Delete obsolete + keep relevant | Sweep, drop dead branches, keep actionable | |
| Convert to GitHub issues | Each todo → issue, remove `.todo` | |

**User's choice:** Leave as-is.

### CI test gate location

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 23 สร้าง test.yml ตอนนี้ (Recommended) | `.github/workflows/test.yml` + branch protection in Phase 23 | ✓ |
| Phase 28 สร้างพร้อมกับ image build | Defer SC#5 to Phase 28 | |
| Reuse existing CI ถ้ามี | Add steps to existing workflow | |

**User's choice:** Phase 23 creates `test.yml`. Phase 28 owns image build / release workflows separately.

### Coverage threshold

| Option | Description | Selected |
|--------|-------------|----------|
| ไม่ตั้ง (Recommended) | Add later once `it.todo` backfill underway | ✓ |
| ตั้ง baseline 70% | Hard fail under 70% | |
| รายงานอย่างเดียว (no fail) | PR coverage comment, no enforcement | |

**User's choice:** No threshold this phase.

---

## DEBT-01: StreamProcessor guard observability

### Metric pattern

| Option | Description | Selected |
|--------|-------------|----------|
| StreamGuardMetricsService (Recommended) | Mirror ArchiveMetricsService — in-memory counter, snapshot, exposed via existing metrics endpoint | ✓ |
| Inline counter in StreamProcessor | Private `Record<string, number>` + `getMetrics()` method | |
| Prometheus exporter | `@willsoto/nestjs-prometheus` Counter | |

**User's choice:** StreamGuardMetricsService. Matches existing pattern, no new deps, reuses `/api/srs/callbacks/metrics`.

### Behavior on undefined cameraId

| Option | Description | Selected |
|--------|-------------|----------|
| Return + log + metric (Recommended) | Preserve current return (no retry storm) + add metric | ✓ |
| Throw + DLQ | Send to BullMQ failed queue | |
| Return + metric + alert | ArchiveMetricsService-style status threshold | |

**User's choice:** Return + log + metric. Preserves Phase 21.1 "no retry storm" guarantee.

### Test scope

| Option | Description | Selected |
|--------|-------------|----------|
| Both unit + integration (Recommended) | Mock-based unit + real BullMQ integration test | ✓ |
| Unit only | Skip integration | |
| Integration only | BullMQ behavior is the real concern | |

**User's choice:** Both. Required by Success Criteria #2.

---

## CI gate ownership

### Workflow split

| Option | Description | Selected |
|--------|-------------|----------|
| 23: test.yml \| 28: build-images.yml + release.yml (Recommended) | Quality gate (Phase 23) and image gate (Phase 28) live in separate workflows | ✓ |
| 23: ลง .github/ ทั้งหมด | All workflows in Phase 23 | |
| 23: ไม่มี workflow เลย | Defer SC#5 entirely to Phase 28 | |

**User's choice:** Split. Phase 23 owns `test.yml` only.

### Branch protection ownership

| Option | Description | Selected |
|--------|-------------|----------|
| มี + Phase 23 set up | User has admin; PLAN includes user-actioned step to require status check | ✓ |
| มีสิทธิ์ แต่ user จะตั้งเอง (Recommended) | PLAN ends with user-facing reminder | |
| ไม่มี | Just commit workflow file; no enforcement v1.3 | |

**User's choice:** "มี + Phase 23 set up" — user has admin and will execute the protection-enable step as part of Phase 23 verification.

---

## Claude's Discretion (defaults applied without discussion)

### DEBT-03: SRS hls_use_fmp4 cold-boot fix

- **Approach:** Remove `hls_use_fmp4` directive unconditionally; lock SRS to v6 (`ossrs/srs:6`).
- **Rationale:** Research summary recommends v6 lock for v1.3; v7 upgrade has its own ticket. Settings UI toggle would be over-engineering.
- **Verification:** Unit test asserting rendered SRS config does not contain `hls_use_fmp4`. Phase 30 smoke test handles cold-boot integration verification.

### DEBT-04: Recording playback page metadata layout

- **Approach:** Header zone above the player. Tag badge row (read-only, same Badge component as Phase 22 camera cards) + line-clamped description block (2-3 lines, "Show more" disclosure).
- **Rationale:** Matches Phase 22 visual pattern (memory: "UI pro minimal preference" — strip optional controls); read-only tags in v1.3 (clickable filter deferred — no spec for it yet).
- **Both pages:** `/app/recordings/[id]` + `/admin/recordings/[id]` if it exists.

---

## Final gate

| Option | Description | Selected |
|--------|-------------|----------|
| ตกลง — เขียน CONTEXT.md ได้ (Recommended) | Proceed to write CONTEXT.md + DISCUSSION-LOG.md | ✓ |
| ขอคุยต่อ — DEBT-04 layout จริง | Mockup discussion | |
| ขอคุยต่อ — DEBT-03 จริง | SRS v6 lock implications | |
| ขอคุยต่อ — มีประเด็นอื่น | Open-ended | |

**User's choice:** Proceed.

---

## Deferred Ideas (captured in CONTEXT.md `<deferred>`)

- 121 `it.todo` placeholder backfill — v1.4+
- Coverage threshold gate — v1.4
- Prometheus exporter — Phase 8 (research-deferred observability profile)
- Production `migrate resolve` baselining — only when a real prod DB exists
- DEBT-04 clickable tag filter — future "search & discovery" phase
- SRS v7 fMP4 upgrade path — separate ticket
- Cosign keyless signing — Phase 8 / v1.3.x
