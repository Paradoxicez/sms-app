---
phase: 260426-udl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx
  - apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx
  - apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx
autonomous: true
requirements:
  - QUICK-260426-UDL-01  # Trim encoder-setup to OBS + NVRs only (drop FFmpeg/Wirecast/vMix)
  - QUICK-260426-UDL-02  # Replace "SRS"/"Simple Realtime Server" with "stream engine" in tenant docs

must_haves:
  truths:
    - "Tenant developer docs no longer mention SRS or Simple Realtime Server anywhere"
    - "Encoder Setup page shows only OBS Studio, Hikvision NVR, and Dahua NVR sections (plus header, Before-you-start, Troubleshooting)"
    - "Stream Profiles pipeline diagrams use 'stream engine' instead of 'SRS'"
    - "Streaming Basics pipeline, numbered list, bullets, and glossary use 'stream engine' instead of 'SRS' / 'Simple Realtime Server'"
    - "apps/web still builds (next build succeeds with no TS / lint errors)"
    - "Super Admin pages, cluster pages, srs-logs hooks, and internal type IDs remain untouched"
  artifacts:
    - path: "apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx"
      provides: "Trimmed encoder setup page (3 product sections + caveats + troubleshooting)"
      removes: ["<section> for FFmpeg (CLI)", "<section> for Wirecast", "<section> for vMix"]
    - path: "apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx"
      provides: "Pipeline diagrams referring to 'stream engine'"
    - path: "apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx"
      provides: "Neutral terminology — 'stream engine' replaces SRS in pipeline, list, bullets, glossary"
  key_links:
    - from: "Tenant /developer/docs/* pages"
      to: "Stream engine product name"
      via: "Generic 'stream engine' phrasing"
      pattern: "stream engine"
    - from: "encoder-setup page"
      to: "Imports"
      via: "DocPage + CodeBlock only (CodeBlock still used by OBS section)"
      pattern: "from \"@/components/(doc-page|code-block)\""
---

<objective>
Make the tenant-facing developer docs neutral on the underlying stream engine product and trim the Encoder Setup guide to only the encoder/NVR options the user actually deploys (OBS + Hikvision NVR + Dahua NVR).

Purpose:
- The user does not want to advertise "SRS" / "Simple Realtime Server" to tenants. Treat it as an internal implementation detail, expose a generic "stream engine" label.
- The user only operates with OBS Studio + Hikvision/Dahua NVRs. The FFmpeg CLI / Wirecast / vMix sections were marketing fluff that creates support burden and confuses real users.

Output:
- 3 modified files (encoder-setup, stream-profiles, streaming-basics).
- 0 mentions of `\bSRS\b` or `Simple Realtime Server` under `apps/web/src/app/admin/developer/docs` and `apps/web/src/app/app/developer/docs`.
- `next build` still passes (no broken imports after removing FFmpeg section).
- No edits to Super Admin, cluster, stream-engine page, srs-logs viewer, dashboard panels, or internal type IDs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx
@apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx
@apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx

<interfaces>
<!-- Components used by all three doc pages — already imported, do not change shape. -->

From apps/web/src/components/doc-page.tsx:
```tsx
export function DocPage({ title, children }: { title: string; children: React.ReactNode }): JSX.Element;
```

From apps/web/src/components/code-block.tsx:
```tsx
export function CodeBlock({ language, code }: { language: string; code: string }): JSX.Element;
```

Both `DocPage` and `CodeBlock` are still required after the trim:
- `DocPage` wraps every page.
- `CodeBlock` is still used by the OBS Studio section (Server / Stream Key block) on the encoder-setup page, and by both stream-profiles + streaming-basics pipeline diagrams. Do NOT drop the `CodeBlock` import on encoder-setup.
</interfaces>

<scope_guardrails>
DO NOT touch any of the following — they are intentionally engine-aware Super Admin / internal surfaces:
- `apps/web/src/app/admin/cluster/**`
- `apps/web/src/app/admin/stream-engine/**`
- `apps/web/src/components/pages/platform-dashboard-page.tsx`
- `apps/web/src/components/dashboard/system-metrics.tsx`
- `apps/web/src/components/dashboard/platform-issues-panel.tsx`
- `apps/web/src/components/cluster/cluster-data-table.tsx`
- `apps/web/src/components/srs-logs/log-viewer.tsx`
- Hook names (`use-srs-logs`), directory names (`srs-logs/`), internal type IDs (`'srs-down'`, `source: 'srs-api'`)
- `apps/web/src/app/app/developer/docs/{slug}/page.tsx` re-exports (single-line re-exports, no edit needed)
- Test fixtures, env var names (`SRS_PUBLIC_HOST` is fine to keep — it's a config name, not user copy)

The git diff for this plan MUST be exactly 3 files. If you find yourself editing anything else, stop.
</scope_guardrails>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Trim encoder-setup to OBS + NVRs only and de-product the caveat</name>
  <files>apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx</files>
  <action>
Edit `apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx` to:

1. **Remove three entire `<section>` blocks** (delete from opening `<section className="space-y-3">` through the matching closing `</section>`):
   - `<h2>FFmpeg (CLI)</h2>` block (currently lines ~62-77)
   - `<h2>Wirecast</h2>` block (currently lines ~79-92)
   - `<h2>vMix</h2>` block (currently lines ~94-109)

   After removal, the section order should be:
   1. Overview
   2. Before you start
   3. OBS Studio
   4. Hikvision NVR
   5. Dahua NVR
   6. Troubleshooting

2. **Update the Overview paragraph** (line ~12) so the enumeration matches what's left. Replace:
   > "This guide shows how to configure encoders and supported NVRs to push streams to the RTMP push URL generated for each camera. Use this when you've selected Push mode in the camera form."

   with:
   > "This guide shows how to configure OBS Studio and supported NVRs (Hikvision, Dahua) to push streams to the RTMP push URL generated for each camera. Use this when you've selected Push mode in the camera form."

3. **Rephrase the SRS caveat** at line ~22. Change:
   > "The platform does not currently accept RTMPS (SRS v6 limitation)."

   to (drop the parenthetical entirely — cleanest read):
   > "The platform does not currently accept RTMPS."

4. **Imports** — leave both `DocPage` and `CodeBlock` imports in place. `CodeBlock` is still used by the OBS Studio section (`Server: ... Stream Key: ...` block at line ~50). Do NOT delete it.

5. **Troubleshooting table** at lines ~150-188 stays as-is. The `SRS_PUBLIC_HOST` reference at line ~170 is a config env var name, not user-facing product copy, and is fine to keep. The "TLS / RTMPS error" row stays.

After editing, the file should be ~140 lines (down from 192) with no FFmpeg/Wirecast/vMix references and no `\bSRS\b` mentions in the prose (the env var `SRS_PUBLIC_HOST` does not match `\bSRS\b` as a standalone word — it's underscore-bounded, but `grep -n "\bSRS\b"` will still match the `SRS` prefix. Verify in the verify step that grep returns 0 hits across docs; if `SRS_PUBLIC_HOST` trips it, change the troubleshooting copy to refer to "the RTMP host" or "stream ingest host" instead).
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && grep -cE "FFmpeg \(CLI\)|Wirecast|vMix|SRS v6 limitation" apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx | grep -q "^0$" && echo OK</automated>
  </verify>
  <done>
- File exists with sections in this exact order: Overview, Before you start, OBS Studio, Hikvision NVR, Dahua NVR, Troubleshooting
- `grep -E "FFmpeg \(CLI\)|Wirecast|vMix|SRS v6 limitation" apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx` returns 0 matches
- File still imports both `DocPage` and `CodeBlock` (OBS section uses CodeBlock)
- Overview paragraph mentions OBS Studio and supported NVRs (Hikvision, Dahua)
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace SRS with "stream engine" in stream-profiles + streaming-basics, then verify build + grep</name>
  <files>apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx, apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx</files>
  <action>
Two file edits, then verification.

**File A: `apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx`** — pipeline diagrams only:

- Line ~29 inside the Passthrough CodeBlock: change
  ``Camera (H.264 1080p 30fps) --> FFmpeg (-c copy) --> SRS --> HLS --> Browser``
  to
  ``Camera (H.264 1080p 30fps) --> FFmpeg (-c copy) --> stream engine --> HLS --> Browser``

- Line ~43 inside the Transcode CodeBlock: change
  ``Camera (H.265 4K 30fps) --> FFmpeg (transcode to H.264 720p 15fps) --> SRS --> HLS --> Browser``
  to
  ``Camera (H.265 4K 30fps) --> FFmpeg (transcode to H.264 720p 15fps) --> stream engine --> HLS --> Browser``

No other content changes in this file.

**File B: `apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx`** — multiple terminology swaps:

1. **Pipeline CodeBlock** (lines ~49-54):
   - `Camera --> RTSP --> FFmpeg --> RTMP --> SRS --> HLS --> Browser` → `Camera --> RTSP --> FFmpeg --> RTMP --> stream engine --> HLS --> Browser`
   - `3. SRS: Receives RTMP, generates HLS segments and m3u8 playlist` → `3. Stream engine: Receives RTMP, generates HLS segments and m3u8 playlist`

2. **Bullet at line ~59**:
   - Old: `<strong>FFmpeg</strong> bridges the gap between RTSP (camera protocol) and RTMP (SRS ingest protocol). It can also transcode H.265 to H.264 when needed.`
   - New: `<strong>FFmpeg</strong> bridges the gap between RTSP (camera protocol) and RTMP (stream engine ingest protocol). It can also transcode H.265 to H.264 when needed.`

3. **Bullet at line ~60** (consolidate to a single mention of stream engine):
   - Old: `<strong>SRS (Simple Realtime Server)</strong> is the stream engine that converts RTMP input to HLS output. It handles segment generation, playlist management, and client connections.`
   - New: `<strong>Stream engine</strong> receives the RTMP feed and produces HLS — handling segment generation, playlist management, and client connections.`

4. **Bullet at line ~107** (WebRTC alternative):
   - Old: `<strong>WebRTC alternative:</strong> For sub-second latency, SRS supports WebRTC (WHEP) playback. This is available for use cases where near-real-time viewing is critical.`
   - New: `<strong>WebRTC alternative:</strong> For sub-second latency, the stream engine supports WebRTC (WHEP) playback. This is available for use cases where near-real-time viewing is critical.`

5. **Glossary RTMP row** (line ~132):
   - Old: `Real-Time Messaging Protocol. Used internally to push video from FFmpeg to SRS.`
   - New: `Real-Time Messaging Protocol. Used internally to push video from FFmpeg to the stream engine.`

6. **Glossary SRS row** (lines ~138-141): rename term cell and rewrite description:
   - Term cell: `SRS` → `Stream engine`
   - Description: `Simple Realtime Server. The stream engine that converts RTMP to HLS and manages client connections.` → `Component that converts RTMP input to HLS output, manages segments and client connections.`

7. **Glossary FFmpeg row** (line ~144):
   - Old: `Multimedia framework for pulling RTSP streams, transcoding video, and pushing to SRS.`
   - New: `Multimedia framework for pulling RTSP streams, transcoding video, and pushing to the stream engine.`

8. **Glossary AES-128 row** (line ~160):
   - Old: `Encryption standard used by SRS to encrypt HLS segments. Prevents unauthorized playback.`
   - New: `Encryption standard used by the stream engine to encrypt HLS segments. Prevents unauthorized playback.`

After both edits, run the verification commands below.
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && \
echo "--- 1. Grep for SRS in tenant docs (must be 0) ---" && \
grep -rnE "\bSRS\b" apps/web/src/app/admin/developer/docs apps/web/src/app/app/developer/docs 2>/dev/null; SRS_HITS=$?; \
echo "--- 2. Grep for 'Simple Realtime Server' in apps/web/src (must be 0) ---" && \
grep -rn "Simple Realtime Server" apps/web/src 2>/dev/null; SRT_HITS=$?; \
echo "--- 3. Git diff file count (must be exactly 3) ---" && \
DIFF_COUNT=$(git diff --name-only apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx | wc -l | tr -d ' '); \
echo "Changed files in scope: $DIFF_COUNT"; \
OUT_OF_SCOPE=$(git diff --name-only -- apps/web/src/ ':!apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx' ':!apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx' ':!apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx' | wc -l | tr -d ' '); \
echo "Out-of-scope changed files (must be 0): $OUT_OF_SCOPE"; \
echo "--- 4. next build (must succeed) ---" && \
pnpm --filter @sms-platform/web build 2>&1 | tail -20; \
BUILD_RC=$?; \
echo "--- Result ---"; \
[ "$SRS_HITS" -eq 1 ] && [ "$SRT_HITS" -eq 1 ] && [ "$OUT_OF_SCOPE" -eq 0 ] && [ "$BUILD_RC" -eq 0 ] && echo "ALL GREEN" || echo "FAIL"
    </automated>
  </verify>
  <done>
- `grep -rnE "\bSRS\b" apps/web/src/app/admin/developer/docs apps/web/src/app/app/developer/docs` returns 0 matches (grep exit code 1)
- `grep -rn "Simple Realtime Server" apps/web/src` returns 0 matches (grep exit code 1)
- Out-of-scope file count under `apps/web/src/` is 0 (only the 3 in-scope files modified)
- `pnpm --filter @sms-platform/web build` exits 0
- Verification block prints `ALL GREEN`
  </done>
</task>

</tasks>

<verification>
Phase-level verification (run after both tasks complete):

```bash
# 1. SRS-free in tenant docs
grep -rnE "\bSRS\b" apps/web/src/app/admin/developer/docs apps/web/src/app/app/developer/docs
# expect: 0 matches (exit 1)

# 2. Simple Realtime Server purged from web app
grep -rn "Simple Realtime Server" apps/web/src
# expect: 0 matches (exit 1)

# 3. Diff scope: exactly the 3 target files in apps/web/src
git diff --name-only -- apps/web/src/
# expect:
#   apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx
#   apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx
#   apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx

# 4. Frontend builds
pnpm --filter @sms-platform/web build
# expect: exit 0
```

Manual smoke (optional, recommended once dev server is running):
- Visit `/admin/developer/docs/encoder-setup` — confirm only OBS Studio, Hikvision NVR, Dahua NVR product sections + caveats + troubleshooting
- Visit `/admin/developer/docs/stream-profiles` — diagrams say "stream engine"
- Visit `/admin/developer/docs/streaming-basics` — pipeline, bullets, glossary all say "stream engine"; no "SRS" anywhere
- Sanity: visit `/admin/cluster`, `/admin/stream-engine`, the platform dashboard — these Super Admin surfaces still show "SRS" / "stream engine" internal labels (UNCHANGED — they are intentionally engine-aware).
</verification>

<success_criteria>
- All four automated checks (grep SRS, grep Simple Realtime Server, scope diff, next build) pass
- Encoder Setup page renders with exactly 6 sections (Overview, Before you start, OBS Studio, Hikvision NVR, Dahua NVR, Troubleshooting) — no FFmpeg/Wirecast/vMix
- Tenant docs use "stream engine" exclusively for product references; "SRS" only survives in non-tenant surfaces (cluster page, stream-engine admin page, srs-logs viewer, internal type IDs, env var names)
- Build is green
- No Super Admin / cluster / dashboard / log-viewer files touched
</success_criteria>

<output>
After completion, create `.planning/quick/260426-udl-trim-encoder-setup-docs-to-obs-nvr-only-/260426-udl-SUMMARY.md` with:
- Files modified (3)
- Sections removed from encoder-setup
- Count of "SRS" → "stream engine" replacements per file
- Verification command outputs (grep counts + build exit code)
- Confirmation that no out-of-scope files were touched
</output>
