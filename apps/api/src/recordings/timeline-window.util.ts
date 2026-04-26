/**
 * Helpers for resolving the UTC time window used by the recordings timeline,
 * calendar, and per-day list endpoints.
 *
 * Why this exists: pre-fix the endpoints accepted a `date=YYYY-MM-DD` (or
 * `year`+`month`) param and treated it as a UTC boundary. The frontend
 * however renders timestamps in browser-local time, so a Bangkok user
 * (UTC+7) saw a 7-hour mismatch between the timeline (UTC-bucketed) and
 * the recordings table (local-formatted). See debug session
 * `recordings-detail-timeline-timezone-mismatch.md`.
 *
 * The new contract: the client sends `startUtc` / `endUtc` ISO strings
 * representing the *user's local-day* boundaries expressed as UTC. The
 * server filters/buckets relative to those instants and never invokes
 * `getHours()` / `getDate()` (both of which depend on TZ env, which we
 * intentionally do not set on the API container).
 *
 * The legacy `date` / `year`+`month` form is preserved for backward
 * compatibility but resolves to the equivalent UTC-day or UTC-month —
 * existing callers see no change in behaviour, while new callers (the
 * recordings hooks) opt into the timezone-correct form by sending
 * `startUtc`/`endUtc`.
 */

export interface UtcWindow {
  start: Date;
  end: Date;
}

/**
 * Resolve a 24h UTC window. Prefers the explicit `startUtc`/`endUtc` pair;
 * falls back to legacy `date=YYYY-MM-DD` (interpreted as UTC midnights).
 * Returns `null` when neither form is supplied OR when the supplied form
 * is malformed — the caller should translate that into a 400.
 */
export function resolveDayWindow(
  date: string | undefined,
  startUtc: string | undefined,
  endUtc: string | undefined,
): UtcWindow | null {
  if (startUtc && endUtc) {
    const start = new Date(startUtc);
    const end = new Date(endUtc);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end.getTime() <= start.getTime()) return null;
    return { start, end };
  }
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      start: new Date(`${date}T00:00:00.000Z`),
      end: new Date(`${date}T23:59:59.999Z`),
    };
  }
  return null;
}

/**
 * Resolve a month-sized UTC window. Prefers the explicit `startUtc`/`endUtc`
 * pair; falls back to legacy `year`+`month` (interpreted as UTC, matching
 * the pre-fix calendar endpoint contract).
 */
export function resolveMonthWindow(
  yearStr: string | undefined,
  monthStr: string | undefined,
  startUtc: string | undefined,
  endUtc: string | undefined,
): UtcWindow | null {
  if (startUtc && endUtc) {
    const start = new Date(startUtc);
    const end = new Date(endUtc);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end.getTime() <= start.getTime()) return null;
    return { start, end };
  }
  if (yearStr && monthStr) {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      month < 1 ||
      month > 12
    ) {
      return null;
    }
    // Legacy fallback: pre-fix `getDaysWithRecordings` used local-time
    // `new Date(year, month-1, 1)` boundaries. Now that the bucketing is
    // window-relative, we replicate that *same* historical UTC slice via
    // explicit Date.UTC so the result matches the pre-fix behaviour byte
    // for byte when a stale client (which still sends year+month) calls in.
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return { start, end };
  }
  return null;
}
