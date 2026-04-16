---
status: diagnosed
trigger: "Tenant dashboard shows mostly static/empty data despite active camera streaming"
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — 4 distinct root causes found (see Resolution)
test: Code trace complete
expecting: N/A
next_action: Return diagnosis

## Symptoms

expected: Dashboard should show live bandwidth from SRS, API usage from recent calls, viewer count, per-camera bandwidth in table, charts with data points.
actual: Bandwidth=0 B/s (wrong), charts empty, camera table shows "NaN GB/s", API usage empty despite recent calls
errors: "NaN GB/s" in camera table bandwidth column (JavaScript NaN leak)
reproduction: Login as admin@testorg.local, go to /app/dashboard. Camera is online and streaming ~2Mbps.
started: First close examination — may have always been broken.

## Eliminated

## Evidence

- timestamp: 2026-04-16T00:01:00Z
  checked: dashboard.service.ts getStats() bandwidth source
  found: Bandwidth stat card reads from ApiKeyUsage PostgreSQL table (aggregate today's records). It does NOT query SRS /api/v1/streams for live stream bandwidth. ApiKeyUsage only tracks HTTP API response bytes via middleware, not SRS stream bandwidth.
  implication: Bandwidth stat card will always show 0 for stream bandwidth — it measures API response bytes, not camera stream bandwidth.

- timestamp: 2026-04-16T00:02:00Z
  checked: ApiKeyUsage data pipeline (Redis -> PostgreSQL)
  found: recordUsage() writes to Redis keys. aggregateDaily() runs via BullMQ cron at 00:05 UTC daily. Dashboard queries PostgreSQL ApiKeyUsage table. Until the daily job runs, today's usage data exists ONLY in Redis and is invisible to dashboard queries.
  implication: Both bandwidth chart and API usage chart show "no data" because data is in Redis, not yet flushed to PostgreSQL. Same-day usage is never visible.

- timestamp: 2026-04-16T00:03:00Z
  checked: getCameraStatusList() return shape vs DashboardCamera frontend interface
  found: Backend returns { id, name, status, lastOnlineAt, viewers } (line 170 uses key "viewers"). Frontend DashboardCamera expects { viewerCount, bandwidth }. Backend does NOT return "bandwidth" per camera at all — field is undefined. Backend returns "viewers" but frontend reads "viewerCount" — also undefined.
  implication: camera.bandwidth is undefined, formatBandwidth(undefined) produces "NaN GB/s". camera.viewerCount is also undefined (always shows 0 or undefined in table), though "viewers" field exists but is ignored.

- timestamp: 2026-04-16T00:04:00Z
  checked: getStats() bandwidth return type vs frontend consumption
  found: Backend returns bandwidth as string (BigInt.toString()). Frontend DashboardStats interface declares bandwidth as number. formatBandwidth(stats.bandwidth) receives a string "0" which works for zero but would fail for non-zero values (string comparison with 1024 behaves unexpectedly in JS).
  implication: Minor type mismatch — works at zero but would produce wrong formatting for non-zero bandwidth values.

## Resolution

root_cause: |
  4 distinct root causes:

  1. **Bandwidth stat card "0 B/s":** `getStats()` aggregates from `ApiKeyUsage` PostgreSQL table, which tracks HTTP API response bytes (via middleware), NOT SRS stream bandwidth. The stream is pushing ~2Mbps through SRS, but that bandwidth is never measured. There is no mechanism to query SRS `/api/v1/streams` for live stream kbps and surface it on the dashboard.

  2. **Bandwidth & API Usage charts empty:** Usage data is written to Redis in real-time (`recordUsage()`), but the daily aggregation job (`aggregateDaily()`) only runs at 00:05 UTC via BullMQ cron. The dashboard queries PostgreSQL `ApiKeyUsage` table. Until the cron job runs, today's data is invisible. If the system has been running less than 24h or the cron job hasn't executed yet, both charts show empty.

  3. **"NaN GB/s" in camera table:** Backend `getCameraStatusList()` returns `viewers` property per camera but frontend `DashboardCamera` interface expects `viewerCount`. Backend does NOT return a `bandwidth` property per camera at all. So `camera.bandwidth` is `undefined`, and `formatBandwidth(undefined)` produces "NaN GB/s". Similarly `camera.viewerCount` is undefined because the backend field is named `viewers`.

  4. **Bandwidth stat type mismatch:** Backend returns `bandwidth` as `string` (from `BigInt.toString()`), but frontend `DashboardStats` interface declares it as `number`. Works at "0" by coincidence but will produce incorrect formatting for non-zero values.

fix:
verification:
files_changed: []
