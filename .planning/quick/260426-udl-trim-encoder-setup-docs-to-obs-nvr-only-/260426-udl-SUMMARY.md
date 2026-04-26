---
phase: 260426-udl
plan: 01
subsystem: tenant-developer-docs
tags: [docs, tenant, branding, ui-copy]
requires: []
provides:
  - "Tenant-facing developer docs neutralized from 'SRS' / 'Simple Realtime Server' to generic 'stream engine'"
  - "Encoder Setup guide trimmed to actual deployment surface: OBS Studio + Hikvision NVR + Dahua NVR"
affects:
  - apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx
  - apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx
  - apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx
tech-stack:
  added: []
  patterns:
    - "Per-tenant docs intentionally hide internal stream engine product name; engine-aware naming preserved on Super Admin / cluster / log-viewer surfaces only"
key-files:
  created: []
  modified:
    - apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx
    - apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx
    - apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx
decisions:
  - "Drop FFmpeg (CLI), Wirecast, vMix sections from Encoder Setup — user only operates OBS + Hikvision/Dahua NVRs; advertising other encoders creates support burden without matching real deployments"
  - "Use generic phrase 'stream engine' (lowercase, not capitalized as a product name) for tenant docs to keep the underlying SRS dependency replaceable without copy churn"
  - "SRS_PUBLIC_HOST env var reference in Troubleshooting copy was reworded to 'RTMP ingest host' so the tenant-facing prose has zero `\\bSRS\\b` matches even with the underscore-bounded env var name"
metrics:
  duration_minutes: 8
  completed: 2026-04-26
---

# Quick 260426-udl: Trim Encoder Setup docs to OBS + NVRs only Summary

One-liner: Tenant docs now hide the SRS product name behind a generic "stream engine" label, and the Push & Encoder Setup guide only documents the encoders the platform actually deploys (OBS Studio + Hikvision NVR + Dahua NVR).

## What Changed

### Task 1 — Trim encoder-setup (commit `afd2d2d`)

Removed three `<section>` blocks plus tightened two prose snippets:

- **Removed sections:** FFmpeg (CLI), Wirecast, vMix (~52 lines of marketing fluff that did not match the actual deployment surface).
- **Overview paragraph:** rewritten from "encoders and supported NVRs" to explicit "OBS Studio and supported NVRs (Hikvision, Dahua)".
- **RTMPS caveat:** dropped the "(SRS v6 limitation)" parenthetical — internal implementation detail leaking to tenants.
- **Troubleshooting → Connection refused row:** swapped the `SRS_PUBLIC_HOST` env-var reference for the neutral phrase "RTMP ingest host" so the tenant copy has zero `\bSRS\b` matches.
- **Imports:** `DocPage` and `CodeBlock` both retained — `CodeBlock` still renders the OBS Studio Server / Stream Key block.

Resulting section order: Overview → Before you start → OBS Studio → Hikvision NVR → Dahua NVR → Troubleshooting (6 sections, exactly as planned).

### Task 2 — Replace SRS with "stream engine" (commit `6bf8952`)

**`stream-profiles/page.tsx`** — 2 replacements (pipeline diagrams only):
- Passthrough CodeBlock: `--> SRS -->` → `--> stream engine -->`
- Transcode CodeBlock: `--> SRS -->` → `--> stream engine -->`

**`streaming-basics/page.tsx`** — 7 replacements:
- Pipeline CodeBlock (line 49): `--> SRS -->` → `--> stream engine -->`
- Pipeline numbered list step 3: `SRS:` → `Stream engine:`
- Bullet "FFmpeg bridges...": `(SRS ingest protocol)` → `(stream engine ingest protocol)`
- Bullet "SRS (Simple Realtime Server)...": rewritten to single-mention `<strong>Stream engine</strong> receives the RTMP feed and produces HLS — handling segment generation, playlist management, and client connections.`
- WebRTC alternative bullet: `SRS supports WebRTC` → `the stream engine supports WebRTC`
- Glossary RTMP description: `pushing to SRS` → `pushing to the stream engine`
- Glossary `SRS` row: term cell `SRS` → `Stream engine`; description rewritten to neutral copy
- Glossary FFmpeg description: `pushing to SRS` → `pushing to the stream engine`
- Glossary AES-128 description: `used by SRS` → `used by the stream engine`

Total per-file SRS → "stream engine" substitutions:
| File | Replacements |
| --- | --- |
| `encoder-setup/page.tsx` | 0 raw substitutions (sections deleted + 2 prose tweaks; SRS_PUBLIC_HOST reference removed) |
| `stream-profiles/page.tsx` | 2 |
| `streaming-basics/page.tsx` | 9 |

## Verification Results

```text
1. grep -rnE "\bSRS\b" apps/web/src/app/admin/developer/docs apps/web/src/app/app/developer/docs
   → 0 matches (exit 1)

2. grep -rn "Simple Realtime Server" apps/web/src
   → 0 matches (exit 1)

3. git diff scope (apps/web/src/, after both commits)
   → exactly 3 in-scope files; 0 out-of-scope changes

4. pnpm --filter @sms-platform/web build
   → exit 0 (full Next.js build succeeded; tenant docs all listed under /app/developer/docs/*)
```

## Out-of-Scope Files

`git diff main..HEAD --name-only -- apps/web/src/` returned exactly:

- `apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx`
- `apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx`
- `apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx`

No edits to:
- `apps/web/src/app/admin/cluster/**`
- `apps/web/src/app/admin/stream-engine/**`
- `apps/web/src/components/pages/platform-dashboard-page.tsx`
- `apps/web/src/components/dashboard/system-metrics.tsx`
- `apps/web/src/components/dashboard/platform-issues-panel.tsx`
- `apps/web/src/components/cluster/cluster-data-table.tsx`
- `apps/web/src/components/srs-logs/log-viewer.tsx`
- Hook names (`use-srs-logs`), directory names (`srs-logs/`), internal type IDs, env var names

## Deviations from Plan

None — plan executed exactly as written. The plan's contingency about `SRS_PUBLIC_HOST` tripping `\bSRS\b` was preemptively addressed by rewriting the Troubleshooting "Connection refused" row to refer to "RTMP ingest host", so the post-build grep returned 0 matches without needing a follow-up fix.

## Commits

| Hash | Task | Description |
|------|------|-------------|
| `afd2d2d` | Task 1 | refactor(260426-udl): trim encoder-setup docs to OBS + NVRs only |
| `6bf8952` | Task 2 | refactor(260426-udl): replace SRS / Simple Realtime Server with "stream engine" in tenant docs |

## Self-Check: PASSED

- `apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx` — modified, exists
- `apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx` — modified, exists
- `apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx` — modified, exists
- `afd2d2d` — found in `git log`
- `6bf8952` — found in `git log`
- `pnpm --filter @sms-platform/web build` — exit 0
- `grep -rnE "\bSRS\b"` over tenant docs — 0 hits
- `grep -rn "Simple Realtime Server"` over `apps/web/src` — 0 hits
