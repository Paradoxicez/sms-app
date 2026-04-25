# Phase 21: Hot-reload Stream Profile changes to running cameras - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 21-hot-reload-stream-profile-changes-to-running-cameras
**Areas discussed:** A) Trigger granularity, B) Restart timing & dedup, C) UX feedback in dialogs, D) Audit log shape, E) Recording during restart, F) Failed restart fallback, G) StreamProfile DELETE protection, H) Webhook to API consumers

---

## Pre-Discussion: Carried-Forward Decisions from Phase 15

These were not re-asked because Phase 15 already locked them and the same patterns apply:

- **Phase 15 D-11:** `jobId = "camera:{cameraId}"` BullMQ dedup → reused for restart enqueue
- **Phase 15 D-03:** Recovery shape SIGTERM → `StatusService.transition('reconnecting')` → enqueue `stream-ffmpeg`
- **Phase 15 D-06:** 0–30s jitter delay for SRS-impacting batches → reused for restart batches
- **Phase 15 D-13/D-15:** Maintenance mode skips restart and suppresses notify/webhook
- **Phase 15 D-04:** 30s notification debounce in `StatusService` → naturally coalesces restart-blip transitions

---

## A) Trigger Granularity

**Question:** Profile update แบบไหนถึงจะ trigger restart cameras?

| Option | Description | Selected |
|--------|-------------|----------|
| Diff FFmpeg-affecting fields only | Compare old vs new for codec/preset/resolution/fps/videoBitrate/audioCodec/audioBitrate; name/description ignored | ✓ |
| Any field change → restart | Bare-minimum: any update enqueues restart | |
| Whitelist field set in code | Hardcoded array of trigger fields | |

**Rationale:** Avoids wasted restarts on metadata-only edits while remaining explicit about what counts as a config-change.

---

## B) Restart Timing & Dedup

**Question:** Restart batch หลาย cameras + dedup rapid edits — ใช้ pattern ไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| jobId dedup + 0–30s jitter | Reuse Phase 15 D-06 + D-11 patterns | ✓ |
| Explicit 5s debounce window | New in-memory map per profile id | |
| Fire all immediately, no jitter | Lean on cluster + SRS to absorb the burst | |

**Rationale:** Reuses two already-canonical Phase 15 patterns; introduces zero new state machinery.

---

## C) UX Feedback in Dialogs

**Question:** Feedback ตอน trigger restart?

| Option | Description | Selected |
|--------|-------------|----------|
| Toast both, no confirm dialog | Toast on profile save and on camera form save | ✓ |
| Confirm dialog if camera live, toast otherwise | Dialog gate when streamProfileId changes on online camera | |
| Confirm dialog both sides | Maximum friction; safest | |
| Silent (no toast, no dialog) | Minimalist | |

**Rationale:** Operator already pressed Save — they intended the change. Toast confirms what just happened without adding a click.

---

## D) Audit Log Shape

**Question:** Audit log entry สำหรับ profile-driven restart?

| Option | Description | Selected |
|--------|-------------|----------|
| New action `camera.profile_hot_reload` | Distinct action + rich meta for filter/query | ✓ |
| Reuse existing action + reason field | `camera.stream_restart` with meta.reason='profile_change' | |
| Two entries per restart | streamprofile.update + camera.profile_hot_reload | |

**Rationale:** Trace clarity > minor schema cost. Operators querying audit logs by action will find these entries naturally.

---

## E) Recording During Restart

**Question:** Camera กำลัง record ตอน profile change — พฤติกรรมไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| Restart immediately, accept gap | 2–5s gap on recording timeline | ✓ |
| Defer restart until recording window ends | Wait up to 1hr | |
| Restart + log gap to recording metadata | Surface gap in timeline UI | |

**Rationale:** Gap is small and the timeline UI already renders SRS DVR segment gaps. Deferring would silently break the user mental model "edit applies now".

---

## F) Failed Restart Fallback

**Question:** Profile-driven restart fail ซ้ำๆ — ทำไง?

| Option | Description | Selected |
|--------|-------------|----------|
| Rely on existing backoff + status=degraded + notify | Phase 15 default | ✓ |
| Auto-revert profile to last-known-good | Snapshot before save, rollback on failure | |
| Skip retry, hard-fail immediately + flag profile | Mark profile invalid | |

**Rationale:** Auto-revert hides operator intent and is fragile. Existing resilience already escalates via status transition + notification.

---

## G) StreamProfile DELETE Protection

**Question:** User ลบ profile ที่ cameras ยังใช้อยู่ — ทำไง?

| Option | Description | Selected |
|--------|-------------|----------|
| Block 409 with detail | Returns `usedBy: [{cameraId, name}]`; UI shows reassign prompt | ✓ |
| Cascade-null + restart cameras with default | Camera silently switches to passthrough default | |
| Soft delete (deletedAt) | Hide from list, leave camera references intact | |

**Rationale:** Explicit > implicit. A silent profile loss would change camera streaming behavior without operator awareness.

---

## H) Webhook to API Consumers

**Question:** Profile-driven restart — webhook ไป external รึเปล่า?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing transitions, new event suppressed | State machine drives the transitions; D-04 30s debounce dedups blip | ✓ |
| Add new event `camera.profile_changed` | Dedicated payload with profile diff | |
| Suppress all transitions during profile restart | Hide blip entirely | |

**Rationale:** No new contract for external consumers. The 30s debounce already absorbs short blips, so well-behaved integrations see steady-state online.

---

## Claude's Discretion

- Toast wording (D-06).
- Hash function for fingerprint (D-01).
- SIGTERM-to-SIGKILL grace timeout for restart flow (D-05).
- 409 response message text (D-10).

## Deferred Ideas

- **View Stream Sheet > Activity tab shows no events** (user-reported mid-discussion; recorded as deferred follow-up — see CONTEXT.md `<deferred>`).

## Free-text User Notes During Discussion

- Round-2 multi-select notes: *"ช่วยเช็ค view stream sheet > tab activity ด้วย ไม่เห็น event อะไรเลย"* — captured as deferred item; user confirmed not to fold into Phase 21 scope.
