# Phase 17: Recording Playback & Timeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 17-recording-playback-timeline
**Areas discussed:** URL & Entry, Date Navigation, Layout, Multi-Recording Day

---

## URL & Entry Point

| Option | Description | Selected |
|--------|-------------|----------|
| A) `/app/recordings/[id]` + click row | Entity-based URL, click row enters detail page of that recording; page loads timeline of camera+date around it | ✓ |
| B) `/app/recordings/camera/[cameraId]?date=YYYY-MM-DD` | Camera+date-based URL; no recording id in URL | |
| C) Row actions menu: Play | Don't hijack row click; explicit Play action in `⋯` menu | |
| D) Hybrid `/app/recordings/[id]?focus=HH:MM` + click row | A + query param for shareable time-specific deep-links | |

**User's choice:** A) `/app/recordings/[id]` + click row
**Notes:** User considered D but decided `?focus=HH:MM` is YAGNI — add later if deep-link use case emerges. Chose A for simplicity and entity-based routing convention (Linear, GitHub, Photos detail pages).

---

## Date Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| A) Calendar popover only | Reuse recordings-tab popover; 2 clicks always even for adjacent days | |
| B) Prev/Next day buttons only | `<` `>` around date label; fast adjacent but slow for long jumps + no visibility of which days have recordings | |
| C) Both: Prev/Next + Calendar popover | `[<] [date ▼] [>]` — 1 click for adjacent, popover for long jumps; popover shows dots on days with recordings | ✓ |

**User's choice:** C) Both
**Notes:** Common CCTV investigation pattern is looking at adjacent days (yesterday → day before) plus occasional long jumps for specific incidents. Low UI cost (2 extra buttons), high value.

---

## Layout

| Option | Description | Selected |
|--------|-------------|----------|
| A) Stacked: player top / timeline / list bottom | Copy layout from `recordings-tab.tsx`; responsive-free, mobile OK | ✓ |
| B) Split: player left 66% + sidebar right 34% (date + list) | YouTube-style; better desktop UX but requires responsive collapse work | |
| C) Immersive: full-bleed video + timeline overlay | Netflix-style; clashes with app's sidebar-nav pattern | |

**User's choice:** A) Stacked
**Notes:** Matches existing `recordings-tab.tsx` layout exactly; maximum component reuse; responsive free. B was considered but requires mobile collapse work (scope creep). C clashes with sidebar-nav style.

---

## Multi-Recording Day Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| A) Click hour → load recording that contains that hour | Reuse `handleSeek` logic from `recordings-tab.tsx:119-134`; zero new backend | ✓ |
| B) Stitch manifest for 24h continuous playback | Virtual m3u8 with `#EXT-X-DISCONTINUITY` tags; requires new `ManifestService.generateDailyManifest()` method; HLS player discontinuity handling (~1 plan scope increase) | |
| C) Row-click default; timeline shows heatmap only | Timeline becomes decoration; doesn't meet REC-02 (click-to-seek) | |

**User's choice:** A) Click hour loads matching recording
**Notes:** Meets REC-02 with zero new backend code. B gives better cross-boundary UX but is scope creep — deferred to future phase if demanded.

---

## Claude's Discretion

Decided by Claude during planning/implementation (see CONTEXT.md §Claude's Discretion):
- Loading skeleton design for player/timeline/list
- Empty state copy and illustrations
- Error state handling (recording deleted, camera deleted, network)
- Exact spacing, typography, breadcrumb
- Auto-play default (leaning toward `autoPlay={false}` — matches existing recordings-tab)
- Optional "Open in camera detail" secondary link

## Deferred Ideas

- Stitched 24h manifest with discontinuity tags — future if cross-boundary playback becomes common
- Shareable `?focus=HH:MM` deep-links — future if incident-sharing use case emerges
- Timeline zoom levels (6h, 1h) — already tracked as REC-04
- Cross-camera timeline — already tracked as REC-05
- Split layout (player + sidebar) — revisit if desktop feedback demands
