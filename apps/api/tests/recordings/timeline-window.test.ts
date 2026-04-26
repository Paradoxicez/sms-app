/**
 * Timezone-correctness tests for the recordings timeline pipeline.
 *
 * These lock the contract for the fix in debug session
 * `recordings-detail-timeline-timezone-mismatch.md`:
 *  - controllers accept `startUtc`/`endUtc` and forward as a UTC window
 *  - manifestService buckets segments relative to the supplied window start,
 *    NOT via `getUTCHours()` / `getUTCDate()`, so a Bangkok-local 17:45
 *    segment (= UTC 10:45) lands in hour 17 of the user's local day, not
 *    hour 10 of the UTC day
 *  - cross-midnight recordings (UTC date != local date) appear in the
 *    correct local-day window instead of being silently filtered out
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestService } from '../../src/recordings/manifest.service';
import {
  resolveDayWindow,
  resolveMonthWindow,
} from '../../src/recordings/timeline-window.util';

describe('resolveDayWindow', () => {
  it('parses (startUtc, endUtc) ISO pair into Date objects', () => {
    const w = resolveDayWindow(
      undefined,
      '2026-04-25T17:00:00.000Z',
      '2026-04-26T16:59:59.999Z',
    );
    expect(w).not.toBeNull();
    expect(w!.start.toISOString()).toBe('2026-04-25T17:00:00.000Z');
    expect(w!.end.toISOString()).toBe('2026-04-26T16:59:59.999Z');
  });

  it('falls back to legacy `date` param as UTC midnights', () => {
    const w = resolveDayWindow('2026-04-26', undefined, undefined);
    expect(w).not.toBeNull();
    expect(w!.start.toISOString()).toBe('2026-04-26T00:00:00.000Z');
    expect(w!.end.toISOString()).toBe('2026-04-26T23:59:59.999Z');
  });

  it('prefers startUtc/endUtc when both forms are supplied', () => {
    const w = resolveDayWindow(
      '2026-04-26',
      '2026-04-25T17:00:00.000Z',
      '2026-04-26T16:59:59.999Z',
    );
    expect(w!.start.toISOString()).toBe('2026-04-25T17:00:00.000Z');
  });

  it('returns null for empty input — caller throws 400', () => {
    expect(resolveDayWindow(undefined, undefined, undefined)).toBeNull();
  });

  it('returns null for malformed `date` string', () => {
    expect(resolveDayWindow('not-a-date', undefined, undefined)).toBeNull();
    expect(resolveDayWindow('2026-4-26', undefined, undefined)).toBeNull();
  });

  it('returns null when window collapses (end <= start)', () => {
    const w = resolveDayWindow(
      undefined,
      '2026-04-26T10:00:00.000Z',
      '2026-04-26T10:00:00.000Z',
    );
    expect(w).toBeNull();
  });

  it('returns null for invalid ISO strings', () => {
    expect(
      resolveDayWindow(undefined, 'banana', '2026-04-26T16:59:59.999Z'),
    ).toBeNull();
  });
});

describe('resolveMonthWindow', () => {
  it('parses (startUtc, endUtc) ISO pair', () => {
    const w = resolveMonthWindow(
      undefined,
      undefined,
      '2026-03-31T17:00:00.000Z',
      '2026-04-30T16:59:59.999Z',
    );
    expect(w).not.toBeNull();
    expect(w!.end.toISOString()).toBe('2026-04-30T16:59:59.999Z');
  });

  it('falls back to year+month', () => {
    const w = resolveMonthWindow('2026', '4', undefined, undefined);
    expect(w).not.toBeNull();
    expect(w!.start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(w!.end.toISOString()).toBe('2026-04-30T23:59:59.999Z');
  });

  it('returns null for invalid month', () => {
    expect(resolveMonthWindow('2026', '13', undefined, undefined)).toBeNull();
    expect(resolveMonthWindow('2026', '0', undefined, undefined)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(
      resolveMonthWindow(undefined, undefined, undefined, undefined),
    ).toBeNull();
  });
});

describe('ManifestService timezone-correct bucketing (REC-03 fix)', () => {
  let service: ManifestService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      recordingSegment: {
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
    };
    service = new ManifestService(mockPrisma, {} as any);
  });

  describe('getSegmentsForDate', () => {
    it('buckets segments by offset from windowStart, NOT by getUTCHours', async () => {
      // Bangkok user picks local 2026-04-26.
      // Local-day window in UTC: 2026-04-25T17:00Z → 2026-04-26T16:59:59.999Z.
      const windowStart = new Date('2026-04-25T17:00:00.000Z');
      const windowEnd = new Date('2026-04-26T16:59:59.999Z');

      // Segment recorded at UTC 10:45 = Bangkok local 17:45 of 2026-04-26.
      // Pre-fix this segment landed at hour 10 (getUTCHours). With the fix
      // it must land at hour 17 — the offset from windowStart is 17.75h.
      mockPrisma.recordingSegment.findMany.mockResolvedValue([
        { timestamp: new Date('2026-04-26T10:45:00.000Z') },
      ]);

      const hours = await service.getSegmentsForDate(
        'cam-1',
        'org-1',
        windowStart,
        windowEnd,
      );

      expect(hours[17].hasData).toBe(true);
      expect(hours[10].hasData).toBe(false); // explicit anti-regression
    });

    it('first segment of the local day (00:00 local) goes to hour 0', async () => {
      const windowStart = new Date('2026-04-25T17:00:00.000Z'); // = 2026-04-26 00:00 BKK
      const windowEnd = new Date('2026-04-26T16:59:59.999Z');

      mockPrisma.recordingSegment.findMany.mockResolvedValue([
        // 00:30 local Bangkok = 17:30 UTC the previous day
        { timestamp: new Date('2026-04-25T17:30:00.000Z') },
      ]);

      const hours = await service.getSegmentsForDate(
        'cam-1',
        'org-1',
        windowStart,
        windowEnd,
      );
      expect(hours[0].hasData).toBe(true);
    });

    it('last segment of the local day (23:xx local) goes to hour 23', async () => {
      const windowStart = new Date('2026-04-25T17:00:00.000Z');
      const windowEnd = new Date('2026-04-26T16:59:59.999Z');

      mockPrisma.recordingSegment.findMany.mockResolvedValue([
        // 23:45 local Bangkok = 16:45 UTC same day
        { timestamp: new Date('2026-04-26T16:45:00.000Z') },
      ]);

      const hours = await service.getSegmentsForDate(
        'cam-1',
        'org-1',
        windowStart,
        windowEnd,
      );
      expect(hours[23].hasData).toBe(true);
    });

    it('returns 24 buckets all-false when no segments match', async () => {
      mockPrisma.recordingSegment.findMany.mockResolvedValue([]);
      const hours = await service.getSegmentsForDate(
        'cam-1',
        'org-1',
        new Date('2026-04-25T17:00:00.000Z'),
        new Date('2026-04-26T16:59:59.999Z'),
      );
      expect(hours).toHaveLength(24);
      expect(hours.every((h) => !h.hasData)).toBe(true);
    });

    it('passes the supplied UTC range to Prisma (no hidden date arithmetic)', async () => {
      const windowStart = new Date('2026-04-25T17:00:00.000Z');
      const windowEnd = new Date('2026-04-26T16:59:59.999Z');
      mockPrisma.recordingSegment.findMany.mockResolvedValue([]);

      await service.getSegmentsForDate('cam-1', 'org-1', windowStart, windowEnd);

      expect(mockPrisma.recordingSegment.findMany).toHaveBeenCalledWith({
        where: {
          cameraId: 'cam-1',
          orgId: 'org-1',
          timestamp: { gte: windowStart, lte: windowEnd },
        },
        select: { timestamp: true },
      });
    });
  });

  describe('getDaysWithRecordings', () => {
    it('buckets days relative to window start, not by getUTCDate', async () => {
      // Bangkok user views April 2026.
      // Local-month window in UTC: 2026-03-31T17:00Z → 2026-04-30T16:59:59.999Z.
      const windowStart = new Date('2026-03-31T17:00:00.000Z');
      const windowEnd = new Date('2026-04-30T16:59:59.999Z');

      // Segment at UTC 2026-04-25T19:00Z = Bangkok 2026-04-26 02:00 (day 26).
      // Pre-fix `getUTCDate()` returned 25 — wrong day. Window-relative gives
      // floor((2026-04-25T19:00 - 2026-03-31T17:00) / 1d) + 1 = 26.
      mockPrisma.recordingSegment.groupBy.mockResolvedValue([
        { timestamp: new Date('2026-04-25T19:00:00.000Z') },
      ]);

      const days = await service.getDaysWithRecordings(
        'cam-1',
        'org-1',
        windowStart,
        windowEnd,
      );
      expect(days).toEqual([26]);
    });

    it('day 1 lands when segment is at local-month-start', async () => {
      const windowStart = new Date('2026-03-31T17:00:00.000Z');
      const windowEnd = new Date('2026-04-30T16:59:59.999Z');

      // 2026-04-01 00:30 Bangkok = 2026-03-31T17:30Z
      mockPrisma.recordingSegment.groupBy.mockResolvedValue([
        { timestamp: new Date('2026-03-31T17:30:00.000Z') },
      ]);

      const days = await service.getDaysWithRecordings(
        'cam-1',
        'org-1',
        windowStart,
        windowEnd,
      );
      expect(days).toEqual([1]);
    });

    it('returns sorted, deduped days', async () => {
      const windowStart = new Date('2026-03-31T17:00:00.000Z');
      const windowEnd = new Date('2026-04-30T16:59:59.999Z');

      mockPrisma.recordingSegment.groupBy.mockResolvedValue([
        { timestamp: new Date('2026-04-09T19:00:00.000Z') }, // day 10
        { timestamp: new Date('2026-04-04T19:00:00.000Z') }, // day 5
        { timestamp: new Date('2026-04-09T20:00:00.000Z') }, // day 10 (dup)
      ]);

      const days = await service.getDaysWithRecordings(
        'cam-1',
        'org-1',
        windowStart,
        windowEnd,
      );
      expect(days).toEqual([5, 10]);
    });
  });
});
