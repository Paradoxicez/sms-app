# Phase 30: Smoke Test on Clean VM (GA gate) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 30-smoke-test-on-clean-vm-ga-gate
**Areas discussed:** VM provider + region, Test domain + ACME strategy, RTSP camera source, Smoke test orchestration level

---

## Pre-flight: Roadmap parser fix

Before discussion: phase title `Phase 30: Smoke Test on Clean VM (gates v1.3 GA)` tripped the GSD milestone-extraction regex (`^#{1,3}\s+.*v\d+\.\d+`) because `v1.3` appeared inside the parenthetical → parser thought Phase 30 was a new milestone heading. Renamed title to `Phase 30: Smoke Test on Clean VM (GA gate)` (both ROADMAP.md occurrences). Init tool now resolves phase 30 cleanly. No semantic change — milestone is still v1.3 by parent section.

---

## Gray Area Selection (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| VM provider + region | Hetzner CX22 vs DO basic vs Vultr/Linode. Locked-once-chosen for reproducibility | ✓ |
| Test domain + ACME strategy | Owned subdomain vs throwaway; staging-first vs production direct | ✓ |
| RTSP camera source | Public test stream vs FFmpeg loop vs operator's IP camera | ✓ |
| Smoke test orchestration level | Manual checklist vs full automation vs hybrid | ✓ |

**User's choice:** All four areas selected.

---

## Area 1: VM provider + region

### Q1: VM provider

| Option | Description | Selected |
|--------|-------------|----------|
| Hetzner CX22 (Recommended) | €4.51/mo, 2 vCPU, 4GB RAM, EU regions; ACME issuance < 30s, GHCR pull fast | |
| DigitalOcean Basic | $6+/mo, multi-region (NYC/SGP/SFO/AMS); marketplace droplet has Docker pre-installed | |
| Vultr / Linode (BYO) | Vultr Cloud Compute 4GB ($24/mo) or Linode shared; would require ROADMAP amendment | |
| Already have a VM (BYO local lab) | Operator has fresh Linux VM (Proxmox/Hyper-V/Multipass/cloud) ready; spec match 4GB/Ubuntu 22.04 + public IP/DNS | ✓ |

**User's choice:** Already have a VM (BYO local lab).

### Q5 (follow-up): Docker pre-install state

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-installed Docker (Recommended) | VM has Docker 26+ + compose plugin; smoke = `git clone` + `cp .env` + `bootstrap.sh`; matches ROADMAP `Docker pre-installed` intent | ✓ |
| Vanilla Ubuntu 22.04 (no Docker) | Operator installs Docker first; not counted in <10-min wall-clock; realistic if no marketplace image | |
| Test both | Run #1 pre-installed, Run #2 vanilla; capture two timing baselines | |

**User's choice:** Pre-installed Docker.

---

## Area 2: Test domain + ACME strategy

### Q2: Domain + CA strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Owned subdomain + staging-first (Recommended) | smoke.<your-domain>; Run #1 = ACME staging CA (untrusted, unlimited); Run #2 = production CA after staging passes; protected from LE 5 fail/hr cap | ✓ |
| Owned subdomain + production direct | Single run, LE production CA; faster but at-risk if ACME path breaks (DNS, port 80) → 1-hr wait or new subdomain | |
| Throwaway (sslip.io / nip.io) | <vm-ip>.sslip.io instant DNS, no domain ownership; nip.io is in Public Suffix List (LE rate-limit applies) | |
| Owned subdomain decided ad-hoc later | Operator picks staging/production at run time; not locked in CONTEXT.md | |

**User's choice:** Owned subdomain + staging-first.

### Q6 (follow-up): Staging→Production flow

| Option | Description | Selected |
|--------|-------------|----------|
| 1 VM: staging → down -v → production (Recommended) | After staging Run #1 PASS, `docker compose down -v` wipes caddy_data + ACME state; switch ACME_CA env back to default; re-run bootstrap.sh = production fresh-state. Matches fresh-VM repeatability intent | ✓ |
| 1 VM: staging → swap CA → cert renew (in-place) | Caddy stays up; manually delete staging cert dir from caddy_data; reload. Faster but doesn't match fresh-VM intent | |
| 2 VMs (clean separation) | VM-A staging, VM-B production. Cleanest semantics but 2x cost/time | |

**User's choice:** 1 VM staging → down -v → production.

### Q14 (follow-up): Domain status

| Option | Description | Selected |
|--------|-------------|----------|
| Operator already has domain → will use subdomain | Owns domain + DNS provider access; A-record `smoke.<your-domain> → VM IP` set at execution | ✓ |
| Not yet — must register first | Buy domain (Cloudflare/Namecheap/etc.); blocks smoke until ready | |
| Use sslip.io fallback (override Q2) | `<vm-ip>.sslip.io`; LE production cert still works; overrides Q2 owned-subdomain choice | |

**User's choice:** Operator already has domain.

---

## Area 3: RTSP camera source

### Q3: Source type

| Option | Description | Selected |
|--------|-------------|----------|
| Self-hosted FFmpeg loop on smoke VM (Recommended) | Run FFmpeg + mediamtx container on smoke VM; loop sample.mp4 as RTSP feed; deterministic, controlled bitrate, zero external dependency | |
| Public RTSP test stream | Wowza / mediamtx public demo; zero setup but external dependency → false-fail risk | ✓ |
| Operator's own IP camera (real hardware) | Hikvision/Dahua/Reolink on operator LAN; production-realistic but requires VPN/RTSP-over-internet exposure | |
| Multiple sources (matrix) | Test self-hosted loop + public stream for coverage; adds runtime | |

**User's choice:** Public RTSP test stream.

### Q7 (follow-up): Specific stream URL

| Option | Description | Selected |
|--------|-------------|----------|
| MediaMTX demo (Recommended) | rtsp://rtspstream:zdgfp@zephyr.rtsp.stream/movie or similar mediamtx-maintained feed; multi-codec; backup = Wowza | ✓ |
| Wowza demo (Big Buck Bunny H.264 VOD) | rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov; long-running, no audio | |
| Both (primary MediaMTX + fallback Wowza) | Document both URLs in SMOKE-TEST-LOG; swap if primary down | |

**User's choice:** MediaMTX demo (with Wowza documented as fallback per CONTEXT.md D-07).

### Q11 (follow-up): SC#2 playback flow detail

| Option | Description | Selected |
|--------|-------------|----------|
| 60s record + DevTools WS frame check (Recommended) | Toggle Record → wait 60s → toggle off → confirm `mc ls local/recordings/...` ≥1 .ts segment > 0 bytes; DevTools Network filter socket.io → trigger camera offline → confirm `camera.status_changed` frame within <10s | ✓ |
| 30s record + curl wss probe only | 30s recording; wss = 101 Switching Protocols only (no event delivery validation) | |
| 120s record + headless event subscriber | 2-min recording + node script socket.io connect + assert frame received | |

**User's choice:** 60s record + DevTools WS frame check.

---

## Area 4: Smoke test orchestration

### Q4: Automation level

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: bash verifiers + manual UI checklist (Recommended) | smoke-test.sh + bash verifiers automate measurable (HTTPS probe, /api/health, wss curl, nmap, db count, MinIO ls, cert persist); manual checklist for UI/playback. SMOKE-TEST-LOG = automated section + manual section | ✓ |
| Full automation (smoke-test.sh end-to-end) | One script runs everything including puppeteer/playwright UI; setup overhead, brittle | |
| Full manual checklist | Operator copy-paste each command; no script overhead; slow + error-prone if iterating | |
| Per-SC modular (verify-deploy + verify-playback + verify-backup + verify-nmap) | Pattern of verify-phase-27.sh; 4 scripts per SC; debug-friendly but boilerplate (covered later in Q8) | |

**User's choice:** Hybrid.

### Q8 (follow-up): Hybrid structure

| Option | Description | Selected |
|--------|-------------|----------|
| Per-SC modular: verify-{deploy,playback,backup,nmap}.sh + smoke-test.sh wrapper (Recommended) | 4 scripts per ROADMAP SC + sequential wrapper + log roll-up; matches Phase 27 verify-phase-27.sh pattern | ✓ |
| Single deploy/scripts/smoke-test.sh | One script runs everything; simpler but can't re-run individual SC | |
| Inline in SMOKE-TEST-LOG.md as fenced commands | No scripts; SMOKE-TEST-LOG has ```bash``` blocks operator copy-pastes; not reusable | |

**User's choice:** Per-SC modular.

### Q9 (follow-up): SMOKE-TEST-LOG.md format

| Option | Description | Selected |
|--------|-------------|----------|
| Structured per-SC table + drift section (Recommended) | Top: 4-row table SC#1-#4 (Result/Evidence/Duration); 9-row table for UAT bundle; bottom: drift bullets + chronological timing log. Skim-friendly + audit-ready | ✓ |
| Narrative timestamped log | Free-form journal with [HH:MM:SS] prefix; verbose but hard to audit | |
| Both: structured summary + narrative body | Summary 1-pager top + chronological log bottom | |

**User's choice:** Structured per-SC table + drift section.

### Q10 (follow-up): Pass/fail gate

| Option | Description | Selected |
|--------|-------------|----------|
| Hard SC#1-#3, soft SC#4 (Recommended) | SC#1 (cold deploy <10min), SC#2 (E2E playback/record/WS), SC#3 (nmap port lockdown) — fail = GA blocked + re-smoke; SC#4 (drift log) — log + queue v1.3.1 backlog, no block | ✓ |
| All-or-nothing | All 4 SC must pass; drift = block; risks over-blocking on cosmetic doc typos | |
| Hard SC#1-#3, soft SC#4 + UAT bundle hard | Same as recommended + 9 deferred UAT items also hard-block | |

**User's choice:** Hard SC#1-#3, soft SC#4.

### Q12 (follow-up): Deliverable file set

| Option | Description | Selected |
|--------|-------------|----------|
| 5-file set (Recommended) | smoke-test.sh + verify-{deploy,playback,backup,nmap}.sh + SMOKE-TEST-LOG.md + 30-VERIFICATION.md | ✓ |
| Compact: 2-file (single smoke-test.sh + log) | Conflicts with Q8 per-SC modular | |
| Extended: 5-file + verify-uat-bundle.sh | Separate UAT verifier; tied to Q10 'UAT bundle hard' if chosen | |

**User's choice:** 5-file set.

### Q13 (follow-up): nmap source

| Option | Description | Selected |
|--------|-------------|----------|
| Operator's local machine (Recommended) | Run nmap from macOS/Linux laptop; matches ROADMAP 'external machine' intent; UDP scan slow (~30-60s) but OK | ✓ |
| Second throwaway VM (cloud-side) | Provision tiny VM, different region, nmap; proves WAN reachability from another network segment but adds setup | |
| Both (defense-in-depth) | Local + cloud-side, document both in SMOKE-TEST-LOG | |

**User's choice:** Operator's local machine.

### Q15 (follow-up): UAT bundle integration

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into verify-{deploy,playback,backup}.sh per SC mapping (Recommended) | Phase 27 SC#1/3/4 + Phase 29 SC#1-#3 → verify-deploy; Phase 27 SC#2 → verify-playback; Phase 29 SC#4 → verify-backup; Phase 29 SC#5 → manual UI; SMOKE-TEST-LOG cross-reference table | ✓ |
| Dedicated verify-uat-bundle.sh | 5th verifier (Q12 → 6-file); separates concerns but duplicates logic | |
| Skip — only ROADMAP SC#1-#4 | Don't verify deferred UAT in Phase 30; conflicts with 'GA gate' intent | |

**User's choice:** Fold into existing verify-*.sh per SC mapping.

### Q16: Continue or write context

| Option | Description | Selected |
|--------|-------------|----------|
| Ready to write CONTEXT.md | Lock decisions and proceed to plan-phase | ✓ |
| Explore more gray areas | Open follow-ups: SRS recording format, drift tolerance, UI checklist scope, etc. | |

**User's choice:** Ready to write CONTEXT.md.

---

## Claude's Discretion

- VM specifics (geographic location, public IP, hostname) — captured at execution time, not in CONTEXT.md (sensitive infra) (D-03)
- Specific RTSP URL active at execution — primary MediaMTX feed and Wowza fallback both documented; operator picks based on reachability check (D-07)
- Bash idioms (color theming, log message format, prompt wording in wrapper) — inherit Phase 29 D-29 conventions (D-18)
- Drift backlog file format — created on-demand if drift detected, location `.planning/todos/v1.3.1-drift-from-phase-30.md` (D-16)
- Manual UI checklist evidence path — `deploy/smoke-evidence/<artifact>-<ts>.png` for screenshots; operator stores alongside log (D-11)
- Wrapper prompt copy / step numbering / progress dots — Claude's discretion within `verify-phase-27.sh` style (D-18)
- Specific verify-* assertion thresholds (e.g., HTTPS probe timeout, nmap rate, ELAPSED tolerance band) — planner picks based on Phase 29 D-10/D-16 precedents

## Deferred Ideas

- Headless puppeteer/playwright UI test — manual checklist + DevTools screenshot sufficient for smoke
- Two-VM staging/production separation — single VM with `down -v` reset matches fresh-VM intent
- Cloud-side nmap from second throwaway VM — local laptop matches 'external machine' intent
- Dedicated verify-uat-bundle.sh — SC mapping inherits hard/soft gate naturally
- sslip.io / nip.io throwaway DNS — operator has owned domain
- Recorded video walkthrough for <10-min claim — bootstrap ELAPSED + SMOKE-TEST-LOG sufficient
- Multi-region VM matrix testing — single-region BYO sufficient
- Vanilla-Ubuntu-no-Docker timing — Docker pre-installed locked
- bin/sms doctor invocation in verifiers — Phase 29 deferred v1.4
- Phase 23 UAT #2 (visual smoke /app/recordings/[id]) — dev-stack scope mismatch
- Phase 23 UAT #3 (gh repo create + branch protection) — orthogonal infra task
- Drift remediation in Phase 30 itself — drift queues to v1.3.1, never fix-inline
- Backup encryption (GPG/age) — operator post-archive responsibility
- Performance/load testing — smoke = functional only
- Multi-camera stress (≥10 cameras) — single test camera sufficient for smoke
- Cosign image signing + verify — DEPLOY-27 deferred v1.4
- SBOM generation — DEPLOY-28 deferred v1.4
- ARM64 multi-arch — DEPLOY-32 deferred v1.4
- Watchtower auto-update — DEPLOY-31 anti-feature in v1.3
