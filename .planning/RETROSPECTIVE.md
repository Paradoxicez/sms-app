# SMS Platform — Retrospective

Living document. Append a new section per milestone; keep cross-milestone trends fresh.

## Milestone: v1.2 — Self-Service, Resilience & UI Polish

**Shipped:** 2026-04-27
**Phases:** 11 (14, 15, 16, 17, 18, 19, 19.1, 20, 21, 21.1, 22) | **Plans:** 64 | **Tasks:** 115
**Timeline:** 2026-04-18 → 2026-04-27 (10 days)
**Audit verdict:** tech_debt — 22/22 REQ-IDs satisfied, 1 enhancement deferred to v1.3

### What Was Built

- **FFmpeg full resilience** — SRS-restart pid-delta detection + bulk re-enqueue (jitter 0–30s), 60s `camera-health` tick, graceful shutdown + boot recovery, hot-reload Stream Profile within 30s via Redis pub/sub for active+locked BullMQ jobs (Phase 15 + 21 + 21.1)
- **Camera maintenance + bulk UX** — StatusService chokepoint with maintenance gate + 30s debounce-by-replacement, asymmetric row-menu (Enter dialog with reason ≤200 / Exit direct), expressive LIVE/REC/MAINT/OFFLINE pills replacing 3-icon composite, multi-select bulk toolbar with `chunkedAllSettled` (concurrency=5) + partial-failure badges (Phase 15 + 20)
- **Recording playback** — `/app/recordings/[id]` route composing HLS player + 24h timeline scrubber + hour-availability heatmap; `findFirst({id, orgId})` closes T-17-V4 cross-org enumeration (Phase 17)
- **User self-service** — `/app/account` + `/admin/account` with avatar upload via MinIO + sharp WebP transcode, password change with `revokeOtherSessions`, plan/usage read-only viewer (Phase 16)
- **Multi-protocol ingest** — 4-protocol DTO allowlist, async codec probe pipeline (3 triggers), 3-layer duplicate prevention, RTMP push with platform-generated stream keys + SRS forward hook (Phase 19 + 19.1)
- **Camera metadata utilization** — Tags + description across 4 surfaces (UI display + backend query + bulk operations + integrations); `tagsNormalized` GIN-indexed shadow column for case-insensitive search; bulk Add/Remove tag with per-camera audit + cache invalidation (Phase 22)
- **DataTable + dashboard polish** — 4 admin DataTable migrations, tenant 6-card stat strip + IssuesPanel, super-admin 7 endpoints + 4 widgets, map teardrop SVG marker + 16:9 popup preview + Tags MultiSelect filter (Phase 14 + 18 + 22)

### What Worked

- **Gap-closure phase pattern** — Phase 21.1 (3 plans / 9 commits) closed Phase 21's runtime defect cleanly without scope creep. Manual UAT surfaced the active+locked BullMQ silent no-op; Phase 21.1 added Redis pub/sub publisher + subscriber + 4 mitigations + hybrid test layer (3 mock units + 1 real-Redis integration reproducing the BKR06 11-PATCH UAT scenario). The ROADMAP "INSERTED" decimal-phase convention made the gap-closure boundary obvious.
- **Locked decision codes (D-01..D-N) for phases without REQ-IDs** — Phases 19, 19.1, 20, 22 used CONTEXT.md decision codes as requirement anchors. 22/22 D-codes traceable end-to-end without REQ-IDs.bloat in REQUIREMENTS.md.
- **Audit trail = single source of truth** — Phase 15 maintenance gate + Phase 20 reason capture + Phase 21 hot-reload audit-then-enqueue all surfaced via existing `AuditInterceptor` `request.body` snapshot. No new audit columns despite 3 phases adding per-camera audit semantics.
- **Composable atomic UI components** — `StatusPills` / `TagsCell` / `IdChipRow` / `MaintenanceReasonDialog` / `BulkToolbar` reusable across `/app/cameras`, `/app/projects`, view-stream-sheet, map popup. Phase 20 ↔ Phase 22 ↔ Phase 18 mostly compose without bespoke wiring.
- **TDD with Wave-0 scaffolding** when used (Phases 17, 18, 21 fully Nyquist-compliant) — `it.todo` stubs flipped RED→GREEN systematically; Phase 18 had 88 stubs across 14 vitest files.
- **Defense-in-depth tenancy** — both `set_config('app.current_org_id', ...)` (RLS in production) AND explicit `WHERE "orgId" = ${orgId}` clause (Phases 22-05 + 22-06) — keeps integration tests passing against superuser without disabling RLS.

### What Was Inefficient

- **Wave-0 / Nyquist drift across 6/11 phases** — Phases 14, 15, 18, 19, 20, 22 carry `wave_0_complete: false`; Phases 14, 19, 22 also `nyquist_compliant: false`. Methodology was bypassed when speed mattered. Phase 21.1 has no VALIDATION.md at all.
- **Stale verification frontmatter** — Phase 14 stayed `human_needed` after 14-HUMAN-UAT.md confirmed 5/5 passed; Phase 21 stayed `gaps_found` after Phase 21.1 closed the gap; Phase 22 frontmatter said `passed` while body said `human_needed`. Required dedicated audit + housekeeping commit at milestone close. Discovered via `gsd-audit-uat` CLI which only reads `## Tests` sections, not frontmatter.
- **Phase 22 ↔ Phase 17 metadata gap** — Phase 22's stated goal "surface tags + description across UI" did not extend into Phase 17's `/app/recordings/[id]` page. Operators reviewing footage cannot see parent camera context. Discovered only at milestone-audit cross-phase integration check, not during Phase 22 verification.
- **BullMQ jobId pitfalls** — colon validation rules (Custom Job IDs must split into exactly 3 parts) caught Phase 15-02 in production-only path; mocks in vitest don't enforce `validateOptions`. Cost a regression discovered only during live UAT (commit 3817b8e in Phase 15).
- **SRS `hls_use_fmp4` cold-boot rejection** — pre-existing settings.service.ts bug emits the directive on every API boot, but SRS 6.0.184 rejects it on cold start while accepting it via `raw=reload`. Blocked Phase 15 Test 1 (full E2E SRS restart auto-reconnect) until resolved out-of-scope.

### Patterns Established

- **Decimal-phase gap closure** — `21.1`, `19.1` proved the pattern. Insert immediately after the parent phase, scope to one decision/defect, ship in <10 commits.
- **D-XX decision codes as requirement anchors** — When a phase doesn't add new feature requirements (e.g., UX polish, gap closure), CONTEXT.md decision codes substitute for REQ-IDs. Verifier maps each D-code to evidence; no orphaned REQs in REQUIREMENTS.md.
- **`audit-then-enqueue` ordering** — Always write the audit row BEFORE the BullMQ side-effect. If the queue add fails, the audit row is still recoverable; if the audit write fails, refuse the action. Pinned by Phase 21 `profile-restart-audit.test.ts`.
- **Single chokepoint suppression** — `StatusService.transition` is the only place that reads maintenanceMode for notify suppression. NotifyDispatchProcessor re-reads at dispatch time as a stale-state safety net (Pitfall 3).
- **Static placeholder Dev Portal docs** — `<YOUR_API_KEY>` and `CAMERA_ID` literals only; never auto-inject real account data into examples (Phase 22-12 + project memory `feedback_api_docs_static_templates`).

### Key Lessons

1. **Run `/gsd-audit-uat` before milestone close** — Catches stale verification frontmatter that local phase verification missed. v1.2 had 3 stale phases (14, 21, 22) discovered only at milestone audit.
2. **Cross-phase integration check finds enrichment gaps that per-phase verifiers can't** — Phase 22 ↔ Phase 17 unwired metadata surface invisible to either phase's verification scope.
3. **Mock-only tests will hide BullMQ runtime defects** — Always pair with one real-infrastructure integration test for queue interactions. Phase 21.1 hybrid test strategy (3 mocks + 1 real-Redis) caught the active+locked silent no-op that Phase 21's mock-only suite missed.
4. **Wave-0 methodology has compound benefits** — Phases 17 + 21 (full Nyquist compliance) shipped with cleaner test boundaries and fewer post-execution regressions than Phases 14 + 19 + 22 (Nyquist-skipped).
5. **Frontmatter-vs-body status drift is a real cost** — When a phase ships and gets manually verified out-of-band, the verification-document frontmatter doesn't auto-update. Either automate the promotion or run a milestone-audit pass to catch it.

### Cost Observations

- **Model mix:** ~80% Opus (planning + execution + verification), ~20% Sonnet (research + integration check).
- **Sessions:** ~30+ across 10 days. Average phase = 1–3 sessions; Phase 22 (12 plans) = 4–5 sessions.
- **Notable:** v1.2 was 64 plans in 10 days = ~6 plans/day (vs v1.1's 15 plans / 2 days = ~7.5 plans/day). v1.2's larger phases (Phase 17 with 5 plans, Phase 18 with 7, Phase 22 with 12) traded velocity for depth and produced much richer test coverage per feature.

---

## Cross-Milestone Trends

### Velocity

| Milestone | Phases | Plans | Days | Plans/day |
|---|---|---|---|---|
| v1.0 | 8 | 53 | TBD | TBD |
| v1.1 | 6 | 15 | 2 | 7.5 |
| v1.2 | 11 | 64 | 10 | 6.4 |

### Methodology Compliance

| Milestone | Wave-0 phases | Nyquist phases | Notes |
|---|---|---|---|
| v1.2 | 5/11 (Phase 17, 21 fully) | 8/11 | Drift on Phase 14, 19, 22 |

### Recurring Tech Debt

- StreamProcessor undefined cameraId guard — open since 2026-04-21 across multiple phases
- Pre-existing API test failures (~23) — surfaced repeatedly in deferred-items.md, never tackled
- Wave-0 / Nyquist methodology drift when speed-pressured

### Patterns That Span Milestones

- v1.1 introduced DataTable; v1.2 finished migrating remaining admin pages to it (Phase 14, 18) and extended it with `onRowClick` (Phase 17), `getRowId: row.id` (Phase 20), `initialState` (Phase 18-06).
- StatusGateway broadcast → StatusService chokepoint → NotifyDispatchProcessor pattern matured across v1.0 (broadcast) → v1.2 Phase 15 (chokepoint + 30s debounce + maintenance gate).
- The "decimal-phase gap closure" convention was first used effectively in v1.2 (Phase 19.1 inserted scope; Phase 21.1 inserted defect closure). Likely to recur in v1.3.

---

*Updated: 2026-04-27 after v1.2 milestone close.*
