# Phase 19.1 — Pre-discuss decisions

Decisions locked before formal discuss session. Feed these into `/gsd-discuss-phase 19.1` so the agent does not re-ask.

**Date:** 2026-04-23

## Locked: RTMPS handling

**Decision:** Defer RTMPS (option C).

Phase 19.1 scope = **RTMP plain only** (port 1935, no TLS). RTMPS is out of scope.

**Why:**
- SRS v6 (current stable, `ossrs/srs:6`) has no native RTMPS — would require nginx/stunnel TLS proxy on port 1936, adding a new container + config surface for a feature that can be delivered natively later.
- SRS v7 (codename Kai) has native RTMPS from v7.0.56+, but is still flagged **Unstable** by the SRS team as of 2026-04-23. v7 GA is planned end-of-2026.
- Cleaner path: ship RTMP plain now, then open a later phase to migrate SRS v6 → v7 once v7 is GA. That single migration phase picks up RTMPS + native RTSP output + v7 feature set in one atomic swap.

**How to apply:**
- Push ingest URL template uses `rtmp://` scheme only (no `rtmps://`).
- Add Camera UI "Source type = Push" does not offer an RTMPS toggle.
- Do not introduce nginx/stunnel or port 1936 in docker-compose in this phase.
- Document the RTMPS gap in user-facing docs so push users with RTMPS-only cameras/NVRs know the current limit.

**Follow-up phase (not yet created):** SRS v6→v7 migration once v7 GA ships (late 2026). That phase owns RTMPS + native RTSP output + any v7 breaking changes.

## Still to discuss in /gsd-discuss-phase 19.1

These items from the Phase 19 deferred entry remain open and need decisions:

- Stream-key format (UUID / nanoid / human slug)
- URL template — `<app>` choice in `rtmp://platform/<app>/<stream-key>`
- Data model: `ingest_mode` discriminator column + separate `stream_key` column vs URL reuse
- Add Camera UI: radio "Source type" (pull/push) + auto-populated copy field for the generated URL
- Bulk import CSV: push rows have no `streamUrl` — platform generates then exports back
- SRS `on_publish` callback authentication against the stream-key
- Stream-key rotation flow
- Zero-transcode optimization when codec = H.264 + AAC
