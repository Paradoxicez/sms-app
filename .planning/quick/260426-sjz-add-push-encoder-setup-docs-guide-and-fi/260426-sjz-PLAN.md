---
phase: quick-260426-sjz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx
  - apps/web/src/app/app/developer/docs/encoder-setup/page.tsx
  - apps/web/src/components/pages/tenant-developer-docs-page.tsx
  - apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
  - apps/web/src/app/admin/cameras/components/push-url-section.tsx
  - apps/web/src/app/admin/cameras/components/created-url-reveal.tsx
autonomous: true
requirements:
  - QUICK-SJZ-01  # Build new "Push & Encoder Setup" docs guide page
  - QUICK-SJZ-02  # Register guide in tenant developer docs menu (6th entry)
  - QUICK-SJZ-03  # Replace 3 broken /docs/push-setup hrefs with working route

must_haves:
  truths:
    - "Visiting /app/developer/docs/encoder-setup renders the Push & Encoder Setup guide (no 404)"
    - "Tenant Developer → Documentation page lists 6 guide cards including the new Push & Encoder Setup card"
    - "Clicking 'Setup guide →' from camera-form-dialog, push-url-section, and created-url-reveal navigates to the new docs page (no 404)"
    - "The new guide explicitly warns RTMP-only (no RTMPS) and explains passthrough H.264+AAC strict-codec rule before any encoder instructions"
    - "Hikvision and Dahua sections lead with caveats that many models are RTSP-only and recommend Pull mode if Platform Access / RTMP push menu is missing"
  artifacts:
    - path: "apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx"
      provides: "Full content of Push & Encoder Setup guide using DocPage + CodeBlock; sections OBS, FFmpeg, Wirecast, vMix, Hikvision, Dahua, Troubleshooting + caveat block"
      min_lines: 180
    - path: "apps/web/src/app/app/developer/docs/encoder-setup/page.tsx"
      provides: "Thin re-export wrapper matching existing guide pattern: export { default } from \"@/app/admin/developer/docs/encoder-setup/page\";"
      min_lines: 1
    - path: "apps/web/src/components/pages/tenant-developer-docs-page.tsx"
      provides: "guides[] array with 6th entry: Push & Encoder Setup Guide → /app/developer/docs/encoder-setup with Upload icon"
      contains: "encoder-setup"
  key_links:
    - from: "apps/web/src/components/pages/tenant-developer-docs-page.tsx"
      to: "/app/developer/docs/encoder-setup"
      via: "guides[] entry href"
      pattern: "/app/developer/docs/encoder-setup"
    - from: "apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx"
      to: "/app/developer/docs/encoder-setup"
      via: "Setup guide → anchor href"
      pattern: "/app/developer/docs/encoder-setup"
    - from: "apps/web/src/app/admin/cameras/components/push-url-section.tsx"
      to: "/app/developer/docs/encoder-setup"
      via: "Setup guide → anchor href"
      pattern: "/app/developer/docs/encoder-setup"
    - from: "apps/web/src/app/admin/cameras/components/created-url-reveal.tsx"
      to: "/app/developer/docs/encoder-setup"
      via: "Setup guide → anchor href"
      pattern: "/app/developer/docs/encoder-setup"
    - from: "apps/web/src/app/app/developer/docs/encoder-setup/page.tsx"
      to: "apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx"
      via: "default re-export"
      pattern: "export.*from.*admin/developer/docs/encoder-setup"
---

<objective>
Replace 3 broken `/docs/push-setup` links (Phase 19.1 leftover) with a working route, and ship the destination doc page as the 6th tenant developer-portal guide.

Purpose: Phase 19.1 added "Setup guide →" links pointing to a route that was never built — they 404 today. Folding the destination into the existing developer docs (NOT a new phase) is the minimal correct fix. Encoder setup guidance is otherwise undocumented for users configuring OBS/FFmpeg/Wirecast/vMix/NVRs against the platform's push URL.

Output: One new docs page (admin master + app re-export wrapper), one tenant docs menu entry, three href fixes — total 6 files touched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/components/pages/tenant-developer-docs-page.tsx
@apps/web/src/app/admin/developer/docs/streaming-basics/page.tsx
@apps/web/src/components/doc-page.tsx
@apps/web/src/components/code-block.tsx
@apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
@apps/web/src/app/admin/cameras/components/push-url-section.tsx
@apps/web/src/app/admin/cameras/components/created-url-reveal.tsx

<interfaces>
<!-- Patterns extracted from existing 5-guide structure. Use these directly — no exploration needed. -->

DocPage component (apps/web/src/components/doc-page.tsx):
```typescript
interface DocPageProps {
  title: string;
  children: React.ReactNode;
}
export function DocPage({ title, children }: DocPageProps): JSX.Element;
```
Wraps content in: breadcrumb (Developer / Documentation / {title}), h1, prose container.

CodeBlock component (apps/web/src/components/code-block.tsx):
```typescript
interface CodeBlockProps {
  code: string;
  language?: string;
}
export function CodeBlock({ code, language }: CodeBlockProps): JSX.Element;
```
Use for terminal commands, URLs, and config snippets. Has built-in copy button.

Existing guide page convention (CONFIRMED from streaming-basics/page.tsx):
- File path: `apps/web/src/app/admin/developer/docs/{slug}/page.tsx` — full content
- Mirror path: `apps/web/src/app/app/developer/docs/{slug}/page.tsx` — single-line re-export:
  `export { default } from "@/app/admin/developer/docs/{slug}/page";`
- Page is `"use client"` component
- Default export is named function: `export default function {Name}GuidePage()`
- Uses `<DocPage title="...">` as outer wrapper
- Section pattern: `<section className="space-y-3">` with `<h2 className="text-xl font-semibold">` + body
- Body text: `<p className="text-sm text-muted-foreground">`
- Inline code: `<code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">...</code>`
- Tables: standard `<table className="w-full text-sm border-collapse">` with `border-b` rows
- Lists: `<ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">`

Existing guides[] entry shape (apps/web/src/components/pages/tenant-developer-docs-page.tsx):
```typescript
{ title: string, description: string, href: string, icon: LucideIcon }
```
Icons currently imported: Workflow, ShieldCheck, SlidersHorizontal, Bell, Play.
For new entry use `Upload` from lucide-react (no collision).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create encoder-setup docs page (admin master + app re-export wrapper)</name>
  <files>
    apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx (new)
    apps/web/src/app/app/developer/docs/encoder-setup/page.tsx (new)
  </files>
  <action>
Create `apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx` as the full content page. Match the structure of `streaming-basics/page.tsx` exactly:

1. Header: `"use client";` + imports `DocPage` from `@/components/doc-page`, `CodeBlock` from `@/components/code-block`
2. Default export function: `export default function EncoderSetupGuidePage()`
3. Wrap in `<DocPage title="Push & Encoder Setup Guide">`

Content (in order, English only — no Thai per user global preference):

**Section 1 — Overview** (`<h2>Overview</h2>`): One paragraph stating "This guide shows how to configure encoders and supported NVRs to push streams to the RTMP push URL generated for each camera. Use this when you've selected Push mode in the camera form."

**Section 2 — Before you start** (`<h2>Before you start</h2>`): Three caveat callouts (use a styled `<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">` or simple `<ul>` with bold leads — pick whichever already exists in other guides; if no precedent, use a plain bulleted list with bold first phrase). The three callouts:
   - **RTMP only, not RTMPS** — disable TLS in your encoder. The platform does not currently accept RTMPS (SRS v6 limitation).
   - **Passthrough profile requires H.264 video + AAC audio** — if your encoder outputs anything else (H.265, Opus, MP3), the publisher will be disconnected immediately. Switch to a Transcode profile or change encoder settings.
   - **ONVIF or RTSP-only cameras** — use Pull mode instead. See the Streaming Basics guide for details on RTSP ingest.

**Section 3 — OBS Studio** (`<h2>OBS Studio</h2>`): Step list: Settings → Stream → Service: "Custom..." → Server = `rtmp://stream.example.com:1935/push` → Stream Key = `{streamKey}` (placeholder shown literally — instruct users to paste the value generated from the camera form). Then under "Recommended encoder settings": Output → Output Mode: Advanced → Encoder: x264 → Audio: AAC → Keyframe Interval: 2s. Use a `<CodeBlock>` for the URL.

**Section 4 — FFmpeg (CLI)** (`<h2>FFmpeg (CLI)</h2>`): One paragraph context, then a `<CodeBlock language="bash" code={...}>` containing the full command:
```
ffmpeg -re -i input.mp4 \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -c:a aac -b:a 128k \
  -f flv rtmp://stream.example.com:1935/push/{streamKey}
```
Note that `-c:v libx264` and `-c:a aac` are required for the Passthrough profile.

**Section 5 — Wirecast** (`<h2>Wirecast</h2>`): Output → Output Settings → Add → RTMP Server → URL = `rtmp://stream.example.com:1935/push`, Stream = `{streamKey}`. Note H.264 + AAC are Wirecast defaults.

**Section 6 — vMix** (`<h2>vMix</h2>`): Settings → Outputs/NDI/SRT → Stream → Quality + Destination → Custom RTMP Server → URL = `rtmp://stream.example.com:1935/push/{streamKey}`. Note H.264 + AAC are vMix defaults.

**Section 7 — Hikvision NVR** (`<h2>Hikvision NVR</h2>`): START with caveat paragraph: "RTMP push is only supported on newer firmware (5.5+) on iDS-7xxx / DS-9xxx series. Many entry-level Hikvision NVRs do not support RTMP push — they output RTSP only. If your NVR menu does not have a Platform Access setting, use Pull mode instead." Then path: Configuration → Network → Advanced Settings → Platform Access (or Stream Push) → Enable, set protocol RTMP, server URL `rtmp://stream.example.com:1935/push/{streamKey}`.

**Section 8 — Dahua NVR** (`<h2>Dahua NVR</h2>`): START with caveat paragraph: "RTMP push is only supported on newer firmware on select Dahua models or via DSS Platform integration. Many Dahua NVRs output RTSP only. If RTMP push is not in the menu, use Pull mode instead." Then path: Setup → Network → Advanced → RTMP → Enable, address `rtmp://stream.example.com:1935/push/{streamKey}`.

**Section 9 — Troubleshooting** (`<h2>Troubleshooting</h2>`): Use a table (`<table className="w-full text-sm border-collapse">`) with two columns: "Symptom" and "Cause / Fix". Rows:
   - "Publisher disconnects immediately after connecting" → "Codec mismatch on Passthrough profile. Switch the camera's stream profile to a Transcode profile, or change encoder settings to H.264 video + AAC audio."
   - "Connection refused" → "Check firewall on port 1935. Verify the host in `SRS_PUBLIC_HOST` is reachable from your encoder network."
   - "TLS / RTMPS error" → "The platform does not support RTMPS. Switch your encoder to plain RTMP (no TLS)."
   - "Push works briefly then drops" → "Stream key may have been rotated/regenerated. Re-copy the URL from the camera detail page. Also verify your encoder bitrate does not exceed available upload bandwidth."

Then create `apps/web/src/app/app/developer/docs/encoder-setup/page.tsx` with a single line:
```typescript
export { default } from "@/app/admin/developer/docs/encoder-setup/page";
```
This matches the existing pattern (verified in app/developer/docs/streaming-basics/page.tsx which is a 1-line re-export).

DO NOT add Thai translations. DO NOT auto-inject real tenant hostnames or stream keys — use `stream.example.com` and `{streamKey}` placeholders verbatim (per global memory: API docs use static placeholders, never real account data).
  </action>
  <verify>
    <automated>test -f apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx && test -f apps/web/src/app/app/developer/docs/encoder-setup/page.tsx && grep -q 'export { default } from "@/app/admin/developer/docs/encoder-setup/page"' apps/web/src/app/app/developer/docs/encoder-setup/page.tsx && grep -q "Push & Encoder Setup Guide" apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx && grep -q "RTMP only, not RTMPS" apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx && grep -q "H.264" apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx && grep -q "Hikvision" apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx && grep -q "Dahua" apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx</automated>
  </verify>
  <done>Both files exist; admin page contains all 9 sections (Overview, Before you start, OBS, FFmpeg, Wirecast, vMix, Hikvision, Dahua, Troubleshooting); RTMP-only caveat present; H.264+AAC requirement called out; app page is a thin re-export of admin page; no Thai copy; placeholder hostnames used (no real tenant data).</done>
</task>

<task type="auto">
  <name>Task 2: Register Push & Encoder Setup as 6th guide in tenant docs menu</name>
  <files>apps/web/src/components/pages/tenant-developer-docs-page.tsx</files>
  <action>
Edit `apps/web/src/components/pages/tenant-developer-docs-page.tsx`:

1. Add `Upload` to the lucide-react import line:
   - Before: `import { Workflow, ShieldCheck, SlidersHorizontal, Bell, Play } from "lucide-react";`
   - After: `import { Workflow, ShieldCheck, SlidersHorizontal, Bell, Play, Upload } from "lucide-react";`

2. Append a 6th entry to the `guides` array (after the Streaming Basics entry):
```typescript
{ title: "Push & Encoder Setup Guide", description: "Configure OBS, FFmpeg, Wirecast, vMix, and supported NVRs to push streams to your generated RTMP URL", href: "/app/developer/docs/encoder-setup", icon: Upload },
```

Do NOT modify any existing entries. Do NOT change the grid layout (it already handles 6 cards via `md:grid-cols-2`).
  </action>
  <verify>
    <automated>grep -q '"Push & Encoder Setup Guide"' apps/web/src/components/pages/tenant-developer-docs-page.tsx && grep -q "/app/developer/docs/encoder-setup" apps/web/src/components/pages/tenant-developer-docs-page.tsx && grep -q "Upload" apps/web/src/components/pages/tenant-developer-docs-page.tsx</automated>
  </verify>
  <done>guides[] array has exactly 6 entries; new entry uses href `/app/developer/docs/encoder-setup` and Upload icon; existing 5 entries untouched.</done>
</task>

<task type="auto">
  <name>Task 3: Fix 3 broken /docs/push-setup hrefs and run build verification</name>
  <files>
    apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
    apps/web/src/app/admin/cameras/components/push-url-section.tsx
    apps/web/src/app/admin/cameras/components/created-url-reveal.tsx
  </files>
  <action>
In all three files, replace the broken href on the "Setup guide →" anchor:

- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` line ~573: `href="/docs/push-setup"` → `href="/app/developer/docs/encoder-setup"`
- `apps/web/src/app/admin/cameras/components/push-url-section.tsx` line ~112: `href="/docs/push-setup"` → `href="/app/developer/docs/encoder-setup"`
- `apps/web/src/app/admin/cameras/components/created-url-reveal.tsx` line ~74: `href="/docs/push-setup"` → `href="/app/developer/docs/encoder-setup"`

Keep all other anchor attributes (`target="_blank"`, `rel="noreferrer"`, classes, "Setup guide →" copy) unchanged.

After all 3 edits, run TypeScript verification: `pnpm --filter @sms-platform/web typecheck` (fall back to `pnpm --filter @sms-platform/web build` if typecheck script absent). Must pass with no new errors.

Also run a final repo grep to confirm zero `/docs/push-setup` occurrences remain anywhere under `apps/web/src`.
  </action>
  <verify>
    <automated>! grep -rn "/docs/push-setup" apps/web/src && grep -q "/app/developer/docs/encoder-setup" apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx && grep -q "/app/developer/docs/encoder-setup" apps/web/src/app/admin/cameras/components/push-url-section.tsx && grep -q "/app/developer/docs/encoder-setup" apps/web/src/app/admin/cameras/components/created-url-reveal.tsx && (cd apps/web && (pnpm typecheck 2>&1 || pnpm build 2>&1) | tail -20)</automated>
  </verify>
  <done>All 3 anchor hrefs updated; zero remaining references to `/docs/push-setup` under `apps/web/src`; web app typechecks/builds successfully; no other code paths or anchor attributes touched.</done>
</task>

</tasks>

<verification>
End-to-end check:
1. `ls apps/web/src/app/app/developer/docs/encoder-setup/page.tsx apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx` — both exist
2. `grep -rn "/docs/push-setup" apps/web/src` — returns 0 matches
3. `grep -c "title:" apps/web/src/components/pages/tenant-developer-docs-page.tsx` — returns 6 (one per guide entry)
4. `pnpm --filter @sms-platform/web typecheck` (or `build`) — exits 0
5. Manual smoke (recommended after merge): visit `/app/developer/docs` → see 6 cards → click "Push & Encoder Setup Guide" → renders without 404. Open Add Camera dialog in Push mode → click "Setup guide →" → opens new tab to the same page.
</verification>

<success_criteria>
- New page route `/app/developer/docs/encoder-setup` resolves and renders content covering OBS, FFmpeg, Wirecast, vMix, Hikvision, Dahua, plus a Before-you-start caveat block (RTMP-only, passthrough codec rule, RTSP-only fallback) and a Troubleshooting table.
- Tenant Documentation index lists 6 guide cards (Push & Encoder Setup is the 6th).
- All 3 previously broken "Setup guide →" links now point to the working route.
- Web app typechecks/builds with no new errors.
- No Thai copy added; no real tenant hostnames or stream keys baked into examples.
</success_criteria>

<output>
After completion, create `.planning/quick/260426-sjz-add-push-encoder-setup-docs-guide-and-fi/260426-sjz-SUMMARY.md` documenting:
- The 6 files modified
- Confirmation that the admin/app dual-page pattern was preserved
- Note on whether typecheck or build was used for verification
- Any deviations from the plan (e.g., if `Upload` icon visually conflicted and a substitute was chosen)
</output>
