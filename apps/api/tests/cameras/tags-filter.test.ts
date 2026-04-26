import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { testPrisma } from '../setup';
import {
  cleanupTestData,
  createTestOrganization,
  createTestPackage,
} from '../helpers/tenancy';
import { CamerasService } from '../../src/cameras/cameras.service';
import { CamerasController } from '../../src/cameras/cameras.controller';

/**
 * Phase 22 Plan 22-02 — `?tags[]=` filter on GET /cameras.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W1-FILTER — D-06 (filter) — case-insensitive OR semantics over `tagsNormalized`
 *
 * Two test layers:
 *   1. Unit (mocked tenancy) — pins the where-clause contract: lowercased,
 *      empties stripped, hasSome operator, no clause when input is absent/empty.
 *      Cheap signal that the service builds the right Prisma query.
 *   2. Integration (testPrisma + RLS) — actually seeds two orgs in PostgreSQL
 *      and asserts the GIN-indexed `tagsNormalized && ARRAY[...]` query returns
 *      the right rows. Pins the case-insensitive matching against the column
 *      populated by the Prisma extension from Plan 22-01 AND the RLS isolation
 *      contract (T-22-01 mitigation).
 */

describe('Phase 22 Plan 22-02 — findAllCameras tags filter (where-clause contract)', () => {
  let service: CamerasService;
  let tenancy: any;

  beforeEach(() => {
    tenancy = {
      camera: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    // Match the constructor pattern used by the rest of cameras/*.test.ts —
    // direct instantiation with positional args (vitest's esbuild transform
    // skips emitDecoratorMetadata so DI cannot resolve the class).
    service = new CamerasService(
      tenancy,
      {} as any, // prisma
      {} as any, // streamsService
      undefined as any, // probeQueue
      undefined, // systemPrisma
      undefined, // srsApi (forwardRef — undefined ok in unit tests)
      undefined, // auditService
    );
  });

  it('Test 1 — single tag is lowercased before being sent to the DB', async () => {
    await service.findAllCameras('org-1', { tags: ['Lobby'] });

    expect(tenancy.camera.findMany).toHaveBeenCalledOnce();
    const callArgs = tenancy.camera.findMany.mock.calls[0][0];
    expect(callArgs.where).toEqual(
      expect.objectContaining({
        tagsNormalized: { hasSome: ['lobby'] },
      }),
    );
  });

  it('Test 2 — multiple tags lowercased + sent as array (OR via hasSome)', async () => {
    await service.findAllCameras('org-1', { tags: ['Lobby', 'ENTRANCE'] });

    const callArgs = tenancy.camera.findMany.mock.calls[0][0];
    expect(callArgs.where.tagsNormalized).toEqual({
      hasSome: ['lobby', 'entrance'],
    });
  });

  it('Test 3 — empty tags array does NOT add a tagsNormalized clause', async () => {
    await service.findAllCameras('org-1', { tags: [] });

    const callArgs = tenancy.camera.findMany.mock.calls[0][0];
    expect(callArgs.where.tagsNormalized).toBeUndefined();
  });

  it('Test 4 — tags absent → no tagsNormalized clause (existing callers untouched)', async () => {
    await service.findAllCameras('org-1');

    const callArgs = tenancy.camera.findMany.mock.calls[0][0];
    expect(callArgs.where.tagsNormalized).toBeUndefined();
  });

  it('Test 5 — empty / whitespace-only tag values are stripped (Pitfall 3 guard)', async () => {
    await service.findAllCameras('org-1', { tags: ['  ', '', 'Lobby'] });

    const callArgs = tenancy.camera.findMany.mock.calls[0][0];
    expect(callArgs.where.tagsNormalized).toEqual({ hasSome: ['lobby'] });
  });

  it('Test 6 — combined siteId + tags applies AND across both', async () => {
    await service.findAllCameras('org-1', {
      siteId: 'site-1',
      tags: ['Lobby'],
    });

    const callArgs = tenancy.camera.findMany.mock.calls[0][0];
    expect(callArgs.where).toEqual(
      expect.objectContaining({
        siteId: 'site-1',
        tagsNormalized: { hasSome: ['lobby'] },
      }),
    );
  });

  it('Test 7 — query goes through the tenancy client (RLS scoping — T-22-01 mitigation)', async () => {
    await service.findAllCameras('org-1', { tags: ['lobby'] });

    // The service MUST call this.tenancy.camera.findMany — using raw prisma
    // would bypass RLS and leak cross-org rows. The mocked `tenancy` is the
    // only camera client wired in beforeEach, so any call landing here proves
    // the contract.
    expect(tenancy.camera.findMany).toHaveBeenCalledOnce();
  });

  it('Test 8 — preserves existing include shape (site → project + streamProfile)', async () => {
    await service.findAllCameras('org-1', { tags: ['lobby'] });

    const callArgs = tenancy.camera.findMany.mock.calls[0][0];
    expect(callArgs.include).toEqual(
      expect.objectContaining({
        site: expect.objectContaining({ include: { project: true } }),
        streamProfile: expect.objectContaining({
          select: expect.objectContaining({ id: true, name: true, codec: true }),
        }),
      }),
    );
  });
});

describe('Phase 22 Plan 22-02 — case-insensitive matching against tagsNormalized (real DB + RLS)', () => {
  let orgA: any;
  let orgB: any;
  let siteA: any;
  let siteB: any;

  beforeAll(async () => {
    await cleanupTestData(testPrisma);

    // Ensure app_user role exists (mirrors rls-isolation.test.ts pattern). Required
    // because the RLS test cases below switch role to app_user mid-transaction.
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
      name: 'TagFilter Org A',
      packageId: pkg.id,
    });
    orgB = await createTestOrganization(testPrisma, {
      name: 'TagFilter Org B',
      packageId: pkg.id,
    });

    // Seed projects + sites + cameras as superuser (testPrisma is the sms role
    // which has rolbypassrls=true — see tests/setup.ts header comment).
    const projA = await testPrisma.project.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        name: 'TagFilter Project A',
      },
    });
    siteA = await testPrisma.site.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        projectId: projA.id,
        name: 'TagFilter Site A',
      },
    });
    const projB = await testPrisma.project.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        name: 'TagFilter Project B',
      },
    });
    siteB = await testPrisma.site.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        projectId: projB.id,
        name: 'TagFilter Site B',
      },
    });

    // Camera A1 in Org A: tags=['Lobby'] (mixed case display)
    await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        siteId: siteA.id,
        name: 'A1-LobbyCam',
        streamUrl: 'rtsp://test/a1-lobby',
        tags: ['Lobby'],
        tagsNormalized: ['lobby'],
        status: 'offline',
      },
    });
    // Camera A2 in Org A: tags=['Entrance']
    await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        siteId: siteA.id,
        name: 'A2-EntranceCam',
        streamUrl: 'rtsp://test/a2-entrance',
        tags: ['Entrance'],
        tagsNormalized: ['entrance'],
        status: 'offline',
      },
    });
    // Camera A3 in Org A: tags=[] (no match for any tag query)
    await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgA.id,
        siteId: siteA.id,
        name: 'A3-NoTags',
        streamUrl: 'rtsp://test/a3-notags',
        tags: [],
        tagsNormalized: [],
        status: 'offline',
      },
    });
    // Camera B1 in Org B: tags=['Lobby'] (must NOT leak when Org A queries lobby)
    await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        siteId: siteB.id,
        name: 'B1-LobbyCam',
        streamUrl: 'rtsp://test/b1-lobby',
        tags: ['Lobby'],
        tagsNormalized: ['lobby'],
        status: 'offline',
      },
    });
  });

  afterAll(async () => {
    await cleanupTestData(testPrisma);
  });

  it('Test 9 — case-insensitive single-tag match: ?tags[]=lobby returns rows tagged "Lobby"', async () => {
    const cameras = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgA.id}, TRUE)`;
      const result = await tx.camera.findMany({
        where: {
          tagsNormalized: { hasSome: ['lobby'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });

    expect(cameras.length).toBe(1);
    expect(cameras[0].name).toBe('A1-LobbyCam');
    // Display casing preserved per D-04 — tags is the canonical user-facing
    // field, tagsNormalized is the lowercased shadow used only for filtering.
    expect(cameras[0].tags).toEqual(['Lobby']);
  });

  it('Test 10 — uppercase query matches lowercase shadow column (Pitfall 3 — input lowercased)', async () => {
    // Simulate `?tags[]=LOBBY` → service lowercases to ['lobby'] → match.
    const cameras = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgA.id}, TRUE)`;
      const result = await tx.camera.findMany({
        where: {
          tagsNormalized: { hasSome: ['LOBBY'.toLowerCase()] },
        },
      });
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });

    expect(cameras.length).toBe(1);
    expect(cameras[0].tags).toEqual(['Lobby']);
  });

  it('Test 11 — multi-tag OR semantics: ?tags[]=lobby&tags[]=entrance returns BOTH rows', async () => {
    const cameras = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgA.id}, TRUE)`;
      const result = await tx.camera.findMany({
        where: {
          tagsNormalized: { hasSome: ['lobby', 'entrance'] },
        },
        orderBy: { name: 'asc' },
      });
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });

    expect(cameras.length).toBe(2);
    const names = cameras.map((c) => c.name).sort();
    expect(names).toEqual(['A1-LobbyCam', 'A2-EntranceCam']);
  });

  it('Test 12 — RLS isolation: Org B query for tags[]=lobby does NOT see Org A rows (T-22-01)', async () => {
    const cameras = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgB.id}, TRUE)`;
      const result = await tx.camera.findMany({
        where: {
          tagsNormalized: { hasSome: ['lobby'] },
        },
      });
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });

    // Both Org A (A1-LobbyCam) and Org B (B1-LobbyCam) have a 'lobby' camera —
    // RLS must scope to Org B only.
    expect(cameras.length).toBe(1);
    expect(cameras[0].orgId).toBe(orgB.id);
    expect(cameras[0].name).toBe('B1-LobbyCam');
  });

  it('Test 13 — non-matching tag returns 0 rows (no false positives)', async () => {
    const cameras = await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET ROLE app_user');
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgA.id}, TRUE)`;
      const result = await tx.camera.findMany({
        where: {
          tagsNormalized: { hasSome: ['this-tag-does-not-exist'] },
        },
      });
      await tx.$executeRawUnsafe('RESET ROLE');
      return result;
    });

    expect(cameras.length).toBe(0);
  });
});

describe('Phase 22 Plan 22-02 — controller Zod query schema parses ?tags[]=', () => {
  // The controller schema lives inline in cameras.controller.ts. We exercise
  // it by instantiating the controller with mocked deps and calling
  // findAllCameras with assorted query shapes. This pins the contract that:
  //   • `?tags[]=a&tags[]=b` arrives as ['a', 'b'] and is forwarded to service
  //   • `?tags[]=lobby` (single value) arrives as a string and is forwarded as ['lobby']
  //   • absent → undefined → service called with no `tags` key

  let controller: CamerasController;
  let camerasService: any;

  beforeEach(() => {
    camerasService = {
      findAllCameras: vi.fn().mockResolvedValue([]),
    };
    controller = new CamerasController(
      camerasService,
      {} as any, // ffprobeService
      { get: () => 'org-1' } as any, // cls
      {} as any, // moduleRef
      {} as any, // snapshotService
    );
  });

  it('Test 14 — array query shape: tags=["Lobby","Entrance"] → service called with both', async () => {
    await controller.findAllCameras(undefined, ['Lobby', 'Entrance']);

    expect(camerasService.findAllCameras).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ tags: ['Lobby', 'Entrance'] }),
    );
  });

  it('Test 15 — single-value query shape: tags="Lobby" → service called with [\'Lobby\']', async () => {
    await controller.findAllCameras(undefined, 'Lobby');

    expect(camerasService.findAllCameras).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ tags: ['Lobby'] }),
    );
  });

  it('Test 16 — absent tags → service called with options containing no tags key', async () => {
    await controller.findAllCameras(undefined, undefined);

    const callArgs = camerasService.findAllCameras.mock.calls[0];
    expect(callArgs[0]).toBe('org-1');
    // Either the second arg is undefined OR it's an object without `tags`.
    const opts = callArgs[1];
    if (opts !== undefined) {
      expect(opts.tags).toBeUndefined();
    }
  });

  it('Test 17 — siteId + tags pass-through preserves both', async () => {
    await controller.findAllCameras('site-1', ['Lobby']);

    expect(camerasService.findAllCameras).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ siteId: 'site-1', tags: ['Lobby'] }),
    );
  });
});
