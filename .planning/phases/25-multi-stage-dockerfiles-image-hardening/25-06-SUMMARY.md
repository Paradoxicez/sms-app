---
plan: 25-06-verification-and-must-haves
phase: 25-multi-stage-dockerfiles-image-hardening
status: complete
completed: 2026-04-27T19:10:00Z
requirements: [DEPLOY-01, DEPLOY-02]
---

# Plan 25-06 Summary — Multi-Arch Verification + gid Hotfix

## Outcome

Phase 25's D-19 11-step manual verification checklist executed across **two platforms** (`linux/arm64` native + `linux/amd64` qemu emulation) per user request. All 4 ROADMAP §Phase 25 success criteria PASS on both platforms. One cosmetic deviation surfaced and was hotfixed in-plan.

## Per-platform results (final, post-hotfix)

| Image | Platform | Content size | Budget | Margin | uid | gid | ffmpeg | tini | /api/health |
|-------|----------|--------------|--------|--------|-----|-----|--------|------|-------------|
| sms-api:phase25-arm64 | linux/arm64 | 400.77 MB | 450 MB | −49 MB | 1001 | 1001 | 5.1.8 | 0.19.0 | n/a |
| sms-api:phase25-amd64 | linux/amd64 | 419.83 MB | 450 MB | −30 MB | 1001 | 1001 | 5.1.8 | 0.19.0 | n/a |
| sms-web:phase25-arm64 | linux/arm64 | 100.11 MB | 220 MB | −120 MB | 1001 | 1001 | n/a | n/a (D-07) | 200 `{ok:true}` |
| sms-web:phase25-amd64 | linux/amd64 | 99.99 MB | 220 MB | −120 MB | 1001 | 1001 | n/a | n/a (D-07) | 200 `{ok:true}` |

## Cross-cutting checks

- `bash scripts/dev-smoke.sh` → exit 0 (no dev workflow regression)
- `pnpm --filter @sms-platform/api test` → 828 passed / 0 failed (Phase 23 baseline)
- `git diff HEAD -- apps/api/Dockerfile.dev` → empty (Phase 24 D-06 byte-identical lock honored)
- `.env` layer scan (Pitfall 8): clean on all 4 images
- Threat model T-25-08..T-25-21: 10/10 passing

## Hotfix applied during plan

`apps/api/Dockerfile:91` originally used `groupadd -r app` (gid auto-assigned to 999). Aligned with Plan 05's web Dockerfile pattern by pinning to `groupadd -r -g 1001 app`. Rebuilt both api images and re-verified gid=1001 on both platforms. Size delta negligible (−1.7 KB arm64 / −4.1 KB amd64).

## Image digests (post-hotfix, audit baseline for Phase 28 CI cross-check)

- `sms-api:phase25-arm64` → `sha256:46011c648047a59e0ecfdda03dd81866417f04ba0f275245ed2650f286f5c8b1`
- `sms-api:phase25-amd64` → `sha256:6162e2fa25a7d59f6fac3f627e7430dc0cb8a8f30926b8f7efdbf48a125e1966`
- `sms-web:phase25-arm64` → `sha256:2f6fe895e8bffb7b1a8e5241838827542be822d2c7750eb110c86612e576fbe3`
- `sms-web:phase25-amd64` → `sha256:760cd8dd6d74d16257e51be59731abaa7ca11da9e11e657c31b6ec771584e071`

## ROADMAP §Phase 25 Success Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | api docker build ≤ 450 MB on `node:22-bookworm-slim` with FFmpeg + tini | PASS (both platforms) |
| 2 | api non-root + ffmpeg on PATH | PASS (uid=1001, gid=1001 post-hotfix) |
| 3 | web docker build ≤ 220 MB; standalone boots port 3000 non-root | PASS (both platforms) |
| 4 | per-app `.dockerignore` + minimized build context | PASS |

## Commits this plan

- `f6878c2` feat(25-06): record multi-arch verification (linux/amd64 + linux/arm64)
- `bb36ade` fix(25-06): pin api group gid=1001 to match web Dockerfile pattern
- `8714233` docs(25-06): record gid=1001 hotfix verification

## Key files

- `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md` — 369-line full report (per-platform tables, hotfix subsection, threat model evidence)
- `apps/api/Dockerfile` — group pin landed (line 91)

## Notes for Phase 28 (CI / GHCR push)

- Use the recorded digests as a regression baseline: any image built on Phase 28 CI hardware (linux/amd64 native) should produce content size within ±5% of `sms-api:phase25-amd64 = 419.83 MB` and `sms-web:phase25-amd64 = 99.99 MB`. Significant divergence likely indicates a `.dockerignore` regression or dependency drift.
- Phase 28's `docker buildx build --platform linux/amd64 -f apps/{api,web}/Dockerfile .` will run native (no qemu), so build time will be 3-5x faster than this local verification round.
- ARM64 images recorded here are NOT a v1.3 deliverable — captured as v1.4+ baseline (Hetzner CAX path).

## Self-Check

PASSED — every D-19 step has a recorded command + output in 25-VERIFICATION.md; both platform image budgets met; threat model fully evidenced; Phase 24 D-06 lock preserved.
