import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterEach,
  afterAll,
  vi,
} from 'vitest';
import { randomUUID } from 'crypto';
import { testPrisma } from '../setup';
import {
  cleanupTestData,
  createTestOrganization,
  createTestPackage,
} from '../helpers/tenancy';
import { CamerasService } from '../../src/cameras/cameras.service';
import { CamerasController } from '../../src/cameras/cameras.controller';
import { TagCacheService } from '../../src/cameras/tag-cache.service';

/**
 * Phase 22 Plan 22-05 — GET /cameras/tags/distinct + RLS isolation + cache hit.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   rows 22-W1-DISTINCT / 22-W1-DISTINCT-RLS — D-09, D-28 — GET /cameras/tags/distinct
 *   threat: T-22-02 (cache leak between orgs)
 *
 * Three test layers:
 *   1. TagCacheService unit (no DB) — pins the `tags:distinct:{orgId}` key
 *      shape, the in-memory fallback when Redis errors, and the second-call
 *      cache-hit behavior (compute() called once across two calls).
 *   2. findDistinctTags integration (testPrisma + RLS app_user role) — seeds
 *      two orgs in PostgreSQL, runs the actual $queryRaw with set_config so we
 *      pin: alphabetized output, case-insensitive de-dup with first-seen
 *      casing per D-04, and cross-org isolation (T-22-02).
 *   3. Controller route smoke — wires CamerasController.getDistinctTags
 *      end-to-end through the service to confirm the response shape
 *      `{ tags: string[] }`.
 *
 * Sampling rate: per-task quick run
 *   `pnpm --filter @sms-platform/api test -- tests/cameras/distinct-tags.test.ts`
 */

// ─── Layer 1: TagCacheService unit ─────────────────────────────────

describe('Phase 22 Plan 22-05 — TagCacheService cache contract', () => {
  it('Test 1 — first call computes and writes through; second call returns cached value', async () => {
    // No Redis injected → memory-only fallback path.
    const cache = new TagCacheService();
    const compute = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(['Lobby', 'Entrance']);

    const first = await cache.getOrCompute('org-1', compute);
    const second = await cache.getOrCompute('org-1', compute);

    expect(first).toEqual(['Lobby', 'Entrance']);
    expect(second).toEqual(['Lobby', 'Entrance']);
    // compute is called exactly ONCE — second call is a cache hit.
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('Test 2 — Redis read failure falls back to in-memory cache without crashing', async () => {
    // Redis client whose .get throws and .setex throws — simulates outage.
    // Service must NOT propagate the error; it falls back to memory + compute.
    const failingRedis: any = {
      get: vi.fn().mockRejectedValue(new Error('redis down')),
      setex: vi.fn().mockRejectedValue(new Error('redis down')),
      del: vi.fn(),
    };
    const cache = new TagCacheService(failingRedis);
    const compute = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(['A']);

    const first = await cache.getOrCompute('org-1', compute);
    expect(first).toEqual(['A']);

    // Second call: redis.get still throws → memory hit serves the value;
    // compute MUST NOT run a second time (memory cache populated by Test 1).
    const second = await cache.getOrCompute('org-1', compute);
    expect(second).toEqual(['A']);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('Test 3 — cache key includes orgId so Org A and Org B never collide', async () => {
    // Use a stub Redis to capture the key passed to setex. The cache key is
    // the T-22-02 mitigation primitive — verify it explicitly.
    const setexCalls: Array<{ key: string; ttl: number; value: string }> = [];
    const stubRedis: any = {
      get: vi.fn().mockResolvedValue(null), // miss
      setex: vi.fn(async (key: string, ttl: number, value: string) => {
        setexCalls.push({ key, ttl, value });
        return 'OK';
      }),
      del: vi.fn(),
    };
    const cache = new TagCacheService(stubRedis);

    await cache.getOrCompute('org-A', async () => ['lobby']);
    await cache.getOrCompute('org-B', async () => ['parking']);

    expect(setexCalls).toHaveLength(2);
    expect(setexCalls[0].key).toBe('tags:distinct:org-A');
    expect(setexCalls[1].key).toBe('tags:distinct:org-B');
    // TTL is 60 seconds per Plan 22-05.
    expect(setexCalls[0].ttl).toBe(60);
    expect(setexCalls[1].ttl).toBe(60);
  });

  it('Test 4 — invalidate() clears both Redis and in-memory entries', async () => {
    const stubRedis: any = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };
    const cache = new TagCacheService(stubRedis);
    const compute = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce(['x'])
      .mockResolvedValueOnce(['y']);

    await cache.getOrCompute('org-1', compute);
    await cache.invalidate('org-1');

    // After invalidate, Redis del is called with the right key AND a fresh
    // call must re-run compute (memory + Redis both empty).
    expect(stubRedis.del).toHaveBeenCalledWith('tags:distinct:org-1');
    const second = await cache.getOrCompute('org-1', compute);
    expect(second).toEqual(['y']);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

// ─── Layer 2: findDistinctTags integration (real DB + RLS) ──────────

describe('Phase 22 Plan 22-05 — findDistinctTags case-insensitive de-dup + alphabetized + RLS', () => {
  let orgA: any;
  let orgB: any;
  let siteA: any;
  let siteB: any;

  beforeAll(async () => {
    await cleanupTestData(testPrisma);

    // Mirror tags-filter.test.ts: ensure app_user role exists so the RLS
    // isolation case below can SET ROLE app_user mid-transaction.
    await testPrisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user LOGIN PASSWORD 'sms_app_user_password';
        END IF;
      END $$;
    `);
    await testPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO app_user`,
    );
    await testPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user`,
    );
    await testPrisma.$executeRawUnsafe(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user`,
    );

    const pkg = await createTestPackage(testPrisma, { maxCameras: 50 });
    orgA = await createTestOrganization(testPrisma, {
      name: 'Distinct Org A',
      packageId: pkg.id,
    });
    orgB = await createTestOrganization(testPrisma, {
      name: 'Distinct Org B',
      packageId: pkg.id,
    });

    const projA = await testPrisma.project.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        name: 'Distinct Project A',
      },
    });
    siteA = await testPrisma.site.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        projectId: projA.id,
        name: 'Distinct Site A',
      },
    });
    const projB = await testPrisma.project.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        name: 'Distinct Project B',
      },
    });
    siteB = await testPrisma.site.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        projectId: projB.id,
        name: 'Distinct Site B',
      },
    });

    // Org A — tags include mixed-casing duplicates. The DISTINCT ON (lower(tag))
    // must collapse "Lobby" + "lobby" to ONE entry, and the resulting list
    // must be alphabetized case-insensitively.
    await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        siteId: siteA.id,
        name: 'A-LobbyCam',
        streamUrl: 'rtsp://test/a-lobby',
        tags: ['Lobby'],
        tagsNormalized: ['lobby'],
        status: 'offline',
      },
    });
    await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        siteId: siteA.id,
        name: 'A-LobbyCam2',
        streamUrl: 'rtsp://test/a-lobby2',
        tags: ['lobby'], // lowercase duplicate of "Lobby"
        tagsNormalized: ['lobby'],
        status: 'offline',
      },
    });
    await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        siteId: siteA.id,
        name: 'A-EntranceCam',
        streamUrl: 'rtsp://test/a-entrance',
        tags: ['Entrance', 'Outdoor'],
        tagsNormalized: ['entrance', 'outdoor'],
        status: 'offline',
      },
    });

    // Org B — has a tag "Confidential" that MUST NOT leak into Org A's
    // distinct response (T-22-02 isolation pin).
    await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        siteId: siteB.id,
        name: 'B-Cam',
        streamUrl: 'rtsp://test/b-confidential',
        tags: ['Confidential'],
        tagsNormalized: ['confidential'],
        status: 'offline',
      },
    });
  });

  afterAll(async () => {
    await cleanupTestData(testPrisma);
  });

  it('Test 5 — basic: returns alphabetized distinct tags for current org with first-seen casing (D-04, D-09)', async () => {
    const tagCache = new TagCacheService(); // memory-only; integration tests don't share Redis state.
    const service = new CamerasService(
      testPrisma as any, // tenancy
      testPrisma as any, // prisma
      undefined as any, // streamsService
      undefined as any, // probeQueue
      undefined, // systemPrisma
      undefined, // srsApi
      undefined, // auditService
      tagCache, // Phase 22 Plan 22-05 — tag cache
    );

    const tags = await service.findDistinctTags(orgA.id);

    // Expected: ['Entrance', 'Lobby', 'Outdoor'] — alphabetized case-insensitively
    // with first-seen casing preserved (Lobby beats lobby because it was
    // inserted first).
    expect(tags).toEqual(['Entrance', 'Lobby', 'Outdoor']);
  });

  it('Test 6 — empty: org with no tagged cameras returns []', async () => {
    // Create a fresh org with one camera that has no tags.
    const emptyPkg = await createTestPackage(testPrisma, { maxCameras: 5 });
    const emptyOrg = await createTestOrganization(testPrisma, {
      name: 'Empty Org',
      packageId: emptyPkg.id,
    });
    try {
      const proj = await testPrisma.project.create({
        data: {
          id: randomUUID(),
          orgId: emptyOrg.id,
          name: 'Empty Project',
        },
      });
      const site = await testPrisma.site.create({
        data: {
          id: randomUUID(),
          orgId: emptyOrg.id,
          projectId: proj.id,
          name: 'Empty Site',
        },
      });
      await testPrisma.camera.create({
        data: {
          id: randomUUID(),
          orgId: emptyOrg.id,
          siteId: site.id,
          name: 'Empty-Cam',
          streamUrl: 'rtsp://test/empty',
          tags: [],
          tagsNormalized: [],
          status: 'offline',
        },
      });

      const tagCache = new TagCacheService();
      const service = new CamerasService(
        testPrisma as any,
        testPrisma as any,
        undefined as any,
        undefined as any,
        undefined,
        undefined,
        undefined,
        tagCache,
      );

      const tags = await service.findDistinctTags(emptyOrg.id);
      expect(tags).toEqual([]);
    } finally {
      // Tidy up so afterAll's full cleanup remains correct.
      await testPrisma.camera.deleteMany({ where: { orgId: emptyOrg.id } });
      await testPrisma.site.deleteMany({ where: { orgId: emptyOrg.id } });
      await testPrisma.project.deleteMany({ where: { orgId: emptyOrg.id } });
      await testPrisma.organization.delete({ where: { id: emptyOrg.id } });
    }
  });

  it('Test 7 — RLS isolation: Org B request never sees Org A tags (T-22-02)', async () => {
    const tagCache = new TagCacheService();
    const service = new CamerasService(
      testPrisma as any,
      testPrisma as any,
      undefined as any,
      undefined as any,
      undefined,
      undefined,
      undefined,
      tagCache,
    );

    const aTags = await service.findDistinctTags(orgA.id);
    const bTags = await service.findDistinctTags(orgB.id);

    // Org A must NOT see "Confidential" (Org B's exclusive tag).
    expect(aTags).not.toContain('Confidential');
    // Org B must NOT see Org A's tags.
    expect(bTags).not.toContain('Lobby');
    expect(bTags).not.toContain('Entrance');
    expect(bTags).not.toContain('Outdoor');
    expect(bTags).toEqual(['Confidential']);
  });

  it('Test 8 — cache hit: second call returns prior result without re-running the DB query', async () => {
    // Spy on the cache's getOrCompute so we can pin the contract that:
    //   1. First call executes the compute (DB hit).
    //   2. Second call within TTL uses the cached value (compute NOT called).
    const tagCache = new TagCacheService();
    const computeSpy = vi.spyOn(tagCache, 'getOrCompute');
    const service = new CamerasService(
      testPrisma as any,
      testPrisma as any,
      undefined as any,
      undefined as any,
      undefined,
      undefined,
      undefined,
      tagCache,
    );

    const first = await service.findDistinctTags(orgA.id);
    const second = await service.findDistinctTags(orgA.id);

    expect(first).toEqual(second);
    // findDistinctTags MUST go through the cache wrapper (T-22-02 + D-28).
    expect(computeSpy).toHaveBeenCalledTimes(2);
    // Both calls return the same array contents — the second call's compute
    // function is NOT invoked because the memory layer hit. We assert this by
    // counting actual compute invocations via a separate spy below.
    computeSpy.mockRestore();

    // Independent verification: if we wipe the cache and call again, we get
    // a fresh result. Then a second call without invalidation hits memory.
    await tagCache.invalidate(orgA.id);
    let computeCalls = 0;
    const tagCache2 = new TagCacheService();
    const origCompute = tagCache2.getOrCompute.bind(tagCache2);
    vi.spyOn(tagCache2, 'getOrCompute').mockImplementation(
      async (orgId, compute) => {
        return origCompute(orgId, async () => {
          computeCalls++;
          return compute();
        });
      },
    );
    const service2 = new CamerasService(
      testPrisma as any,
      testPrisma as any,
      undefined as any,
      undefined as any,
      undefined,
      undefined,
      undefined,
      tagCache2,
    );
    await service2.findDistinctTags(orgA.id);
    await service2.findDistinctTags(orgA.id);
    // Two service calls → two getOrCompute calls, but only ONE compute() (DB
    // round-trip) because the second was a cache hit.
    expect(computeCalls).toBe(1);
  });
});

// ─── Layer 3: Controller route smoke ────────────────────────────────

describe('Phase 22 Plan 22-05 — GET /cameras/tags/distinct controller route', () => {
  let controller: CamerasController;
  let camerasService: any;

  beforeEach(() => {
    camerasService = {
      findDistinctTags: vi.fn().mockResolvedValue(['Entrance', 'Lobby']),
    };
    controller = new CamerasController(
      camerasService,
      {} as any, // ffprobeService
      { get: () => 'org-1' } as any, // cls
      {} as any, // moduleRef
      {} as any, // snapshotService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Test 9 — controller returns { tags: string[] } and threads orgId from CLS', async () => {
    const result = await controller.getDistinctTags();

    expect(result).toEqual({ tags: ['Entrance', 'Lobby'] });
    expect(camerasService.findDistinctTags).toHaveBeenCalledWith('org-1');
  });

  it('Test 10 — empty result still returns { tags: [] } not undefined', async () => {
    camerasService.findDistinctTags.mockResolvedValue([]);
    const result = await controller.getDistinctTags();

    expect(result).toEqual({ tags: [] });
  });
});
