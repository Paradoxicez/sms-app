# SMS Platform — Smoke Test Log

This file records cold-deploy timings from `deploy/scripts/bootstrap.sh`.

- Phase 29 (DEPLOY-23) ships the timing-log mechanism: `bootstrap.sh` prints `Bootstrap time: ${ELAPSED}s` at the end of every run (start timestamp captured at script entry, elapsed computed from `date +%s` arithmetic — see Plan 29-02 D-12).
- Phase 30 (DEPLOY-25) populates this log with timings from a real fresh-VM provision (DigitalOcean / Hetzner), which is the v1.3 GA acceptance evidence for ROADMAP §Phase 29 SC #5 (the "<10-minute claim" gate).

To append your own timing entry, redirect stdout when you run bootstrap:

```bash
bash deploy/scripts/bootstrap.sh 2>&1 | tee -a deploy/SMOKE-TEST-LOG.md
```

The "Bootstrap time" line at the end of bootstrap.sh's output is the canonical ELAPSED measurement.

## Entries

_No entries yet — the first entry will be recorded in Phase 30 (DEPLOY-25)._
