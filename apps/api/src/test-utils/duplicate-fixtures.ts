// apps/api/src/test-utils/duplicate-fixtures.ts
//
// Phase 19 — shared duplicate fixtures for migration + service dedup tests.
//
// Consumed by:
//   - apps/api/tests/migrations/camera-dedup.test.ts (Plan 04 dedup SQL)
//   - apps/api/tests/cameras/bulk-import.test.ts (service within-file dedup)
//
// Pure data — no Prisma imports, no I/O. Tests wire these rows into their
// own harness.

export interface DuplicateFixtureCamera {
  id: string;
  orgId: string;
  siteId: string;
  name: string;
  streamUrl: string;
  createdAt: Date;
}

export const DUPLICATE_ORG_A = '00000000-0000-0000-0000-00000000000a';
export const DUPLICATE_ORG_B = '00000000-0000-0000-0000-00000000000b';
export const DUPLICATE_SITE = '00000000-0000-0000-0000-0000000000aa';

/**
 * Three tuples of duplicates for dedup SQL test.
 * Each tuple has 3 rows with identical (orgId, streamUrl) but different createdAt.
 * The dedup SQL MUST keep the row with the earliest createdAt per tuple (keep-oldest per A3).
 */
export const duplicateFixture: DuplicateFixtureCamera[] = [
  // Tuple 1 — orgA, rtsp://cam1 (3 rows, keep id=cam1-old)
  { id: 'cam1-old',    orgId: DUPLICATE_ORG_A, siteId: DUPLICATE_SITE, name: 'Cam1 old',    streamUrl: 'rtsp://10.0.0.1/s', createdAt: new Date('2024-01-01T00:00:00Z') },
  { id: 'cam1-mid',    orgId: DUPLICATE_ORG_A, siteId: DUPLICATE_SITE, name: 'Cam1 mid',    streamUrl: 'rtsp://10.0.0.1/s', createdAt: new Date('2024-06-01T00:00:00Z') },
  { id: 'cam1-newest', orgId: DUPLICATE_ORG_A, siteId: DUPLICATE_SITE, name: 'Cam1 newest', streamUrl: 'rtsp://10.0.0.1/s', createdAt: new Date('2024-12-01T00:00:00Z') },

  // Tuple 2 — orgA, rtmp://cam2 (2 rows, keep id=cam2-old)
  { id: 'cam2-old', orgId: DUPLICATE_ORG_A, siteId: DUPLICATE_SITE, name: 'Cam2 old', streamUrl: 'rtmp://rtmp.example/live', createdAt: new Date('2024-02-01T00:00:00Z') },
  { id: 'cam2-new', orgId: DUPLICATE_ORG_A, siteId: DUPLICATE_SITE, name: 'Cam2 new', streamUrl: 'rtmp://rtmp.example/live', createdAt: new Date('2024-11-01T00:00:00Z') },

  // Tuple 3 — orgB with SAME url as orgA (must NOT be treated as duplicate — tenant-scoped per T-19-05)
  { id: 'cam3-b', orgId: DUPLICATE_ORG_B, siteId: DUPLICATE_SITE, name: 'Cam3 orgB', streamUrl: 'rtsp://10.0.0.1/s', createdAt: new Date('2024-03-01T00:00:00Z') },

  // Unique row — must be preserved untouched
  { id: 'cam4-unique', orgId: DUPLICATE_ORG_A, siteId: DUPLICATE_SITE, name: 'Cam4 unique', streamUrl: 'srt://cast.example:9000', createdAt: new Date('2024-04-01T00:00:00Z') },
];

/** Expected survivors after keep-oldest dedup. */
export const expectedSurvivorIds: string[] = ['cam1-old', 'cam2-old', 'cam3-b', 'cam4-unique'];

/** Total rows BEFORE dedup = 7; AFTER dedup = 4. */
export const expectedDedupDeletedCount = 3;

/** Helper for bulk-import service dedup tests (not DB rows). */
export function buildDuplicateCameras(_orgId: string): Array<{ name: string; streamUrl: string }> {
  return [
    { name: 'A', streamUrl: 'rtsp://host/a' },
    { name: 'B', streamUrl: 'rtsp://host/a' }, // within-file dup of A
    { name: 'C', streamUrl: 'rtmp://host/c' }, // unique
    { name: 'D', streamUrl: 'rtsp://host/a' }, // within-file dup of A
  ];
}
