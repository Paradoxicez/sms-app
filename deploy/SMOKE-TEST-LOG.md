# SMS Platform — Phase 30 Smoke Test Log

**Status:** TEMPLATE — overwrite during smoke run.
**Phase:** 30 (Smoke Test on Clean VM — v1.3 GA gate)
**SC mapping:** ROADMAP.md §Phase 30 lines 196-205

> **Redaction notice (D-11):** Before committing this file or sharing it, redact:
> - `${ADMIN_PASSWORD}` — never paste plaintext credentials
> - `${RTSP_TEST_URL}` user:pass — strip the userinfo segment
> - `${VM_IP}` — replace with `<vm-public-ip>` if the VM remains in service
> - Any LE cert serial / ACME order ID — operator-private, no value to repo readers
>
> Evidence files (screenshots, raw logs) live alongside this log under `deploy/smoke-evidence/<UTC-ts>/`. That folder is `.gitignore`-d; only this Markdown ships with the repo as the public smoke-run record.

## Run metadata

| Field | Value |
|-------|-------|
| Run UTC start | _<YYYY-MM-DDTHH:MMZ>_ |
| VM hostname | _<hostname>_ |
| VM specs | _<vCPUs / RAM / disk>_ |
| OS | Ubuntu 22.04 LTS |
| Docker version | _<output of `docker --version`>_ |
| Compose plugin | _<output of `docker compose version`>_ |
| Domain | _<smoke.example.com>_ |
| ACME run #1 CA | staging (acme-staging-v02.api.letsencrypt.org/directory) |
| ACME run #2 CA | production (acme-v02.api.letsencrypt.org/directory) |
| IMAGE_TAG | _<vX.Y.Z or `latest`>_ |
| Operator | _<name / handle>_ |

## Success Criteria results (hard gate per D-12 except SC#4 = soft)

| SC | Description | Verifier | Result | Evidence | Duration |
|----|-------------|----------|--------|----------|----------|
| #1 | Cold deploy <10 min wall-clock from `bootstrap.sh` to logged-in super-admin session | verify-deploy.sh | _PASS/FAIL_ | _bootstrap.sh ELAPSED line + verifier exit code_ | _<N>s_ |
| #2 | E2E playback + record + WebSocket on deployed VM (RTSP→HLS→.ts archive→WS frame) | verify-playback.sh + manual UI (D-14) | _PASS/FAIL_ | _MinIO `mc ls` output + DevTools screenshot path_ | _<N>s_ |
| #3 | nmap port lockdown — only 22/80/443/1935/8080/8000-udp/10080-udp open externally | verify-nmap.sh | _PASS/FAIL_ | _nmap stdout pasted below_ | _<N>s_ |
| #4 | Drift log captured (soft gate — does NOT block GA) | smoke-test.sh wrapper + this section | _PASS/DRIFT_ | _Drift section row count_ | _N/A_ |

## Deferred UAT cross-reference (D-13 mapping)

Each row inherits the hard/soft status of its SC owner.

| UAT origin | Description | Folded into | SC owner | Result | Evidence |
|-----------|-------------|-------------|----------|--------|----------|
| Phase 27 SC#1 | Live LE cert + 308 redirect on real DNS | verify-deploy.sh | SC#1 | _PASS/FAIL_ | _curl -i excerpt_ |
| Phase 27 SC#2 | Live wss:// upgrade through caddy to NotificationsGateway + StatusGateway | verify-playback.sh | SC#2 | _PASS/FAIL_ | _HTTP/1.1 101 line_ |
| Phase 27 SC#3 | Cert persistence across `docker compose down/up` | verify-deploy.sh | SC#1 | _PASS/FAIL_ | _grep -c 'certificate obtained' = 0 on second boot_ |
| Phase 27 SC#4 | Re-run `bash deploy/scripts/verify-phase-27.sh` exits 0 on healthy host | verify-deploy.sh | SC#1 | _PASS/FAIL_ | _verifier exit code + tail_ |
| Phase 29 SC#1 | Cold deploy <10-min wall-clock claim | verify-deploy.sh | SC#1 | _PASS/FAIL_ | _bootstrap ELAPSED line_ |
| Phase 29 SC#2 | bin/sms create-admin runtime + idempotent --force rotation | verify-deploy.sh | SC#1 | _PASS/FAIL_ | _exec exit code + login screenshot_ |
| Phase 29 SC#3 | update.sh atomic recycle without dropping in-flight requests | verify-deploy.sh | SC#1 | _PASS/FAIL_ | _curl-probe 200 count during recycle_ |
| Phase 29 SC#4 | backup.sh + restore.sh byte-equivalent round-trip | verify-backup.sh | SC#4 (informational; backup is SC#4 evidence not GA gate) | _PASS/FAIL_ | _SELECT count diff = 0 + mc diff empty_ |
| Phase 29 SC#5 | README quickstart end-to-end (operator follows verbatim, captures drift) | smoke-test.sh wrapper + manual | SC#1 | _PASS/FAIL/DRIFT_ | _operator self-report_ |

## Manual UI checklist (D-14, executed alongside automated verifiers)

Operator ticks each step + pastes evidence reference.

- [ ] 1. Login as super-admin (ADMIN_EMAIL/ADMIN_PASSWORD from `.env`) — confirm session cookie + redirect to dashboard. _Evidence: <screenshot path>_
- [ ] 2. Register test camera (RTSP URL from D-07) — confirm UI shows status `connecting → live` within 30s. _Evidence: <screenshot path>_
- [ ] 3. Click camera card → play HLS player → confirm video playback (10s observation). _Evidence: <screenshot path>_
- [ ] 4. Toggle Record → wait 60s → toggle off (D-08). _Evidence: <MinIO mc ls excerpt>_
- [ ] 5. DevTools WebSocket frame inspection during status change (D-08). _Evidence: <screenshot path>_
- [ ] 6. Stop external RTSP feed → confirm UI status pill changes `live → offline` within <30s (Phase 15 resilience demo). _Evidence: <screenshot path>_
- [ ] 7. README.md follow-along — operator reads `deploy/README.md` Quickstart 1-5 verbatim and notes any docs-vs-reality mismatch in the Drift section. _Evidence: <drift entries below>_

## Drift (D-16 — queue, do not fix inline during smoke)

Add one bullet per drift discovery. Format: `- <docs ref> says X, actual Y → action: <queued v1.3.1 / fixed inline / no-op>`.

- _<no drift detected — delete this placeholder if empty>_

If any rows exist below, also create `.planning/todos/v1.3.1-drift-from-phase-30.md` with one entry per row.

## Timing log

Chronological event log; copy from terminal output as smoke progresses.

```
<UTC-ts>  bootstrap.sh start
<UTC-ts>  bootstrap.sh exit 0  ELAPSED=<N>s
<UTC-ts>  verify-deploy.sh start
<UTC-ts>  verify-deploy.sh exit <0|1|2>  duration=<N>s
<UTC-ts>  manual UI checklist steps 1-6 complete
<UTC-ts>  verify-playback.sh start
<UTC-ts>  verify-playback.sh exit <0|1|2>  duration=<N>s
<UTC-ts>  verify-backup.sh start
<UTC-ts>  verify-backup.sh exit <0|1|2>  duration=<N>s
<UTC-ts>  verify-nmap.sh start (operator's local machine)
<UTC-ts>  verify-nmap.sh exit <0|1|2>  duration=<N>s
<UTC-ts>  smoke-test.sh wrapper exit <0|1|2>  total=<N>s
```

## GA verdict

> Operator fills after the wrapper completes. Hard gate (SC#1 + SC#2 + SC#3 + Phase 29 SC#4) all PASS → GA approved. Any HARD FAIL → re-smoke required after fix lands. SC#4 DRIFT → ship + queue v1.3.1.

**Verdict:** _GA APPROVED / RE-SMOKE REQUIRED / GA APPROVED WITH DRIFT_

**Drift backlog file:** `.planning/todos/v1.3.1-drift-from-phase-30.md` _(create only if drift entries exist)_

---

*Template authored Phase 30 Plan 01.*
