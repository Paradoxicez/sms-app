import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { testPrisma } from '../setup';
import {
  cleanupTestData,
  createTestOrganization,
  createTestPackage,
} from '../helpers/tenancy';
import { CamerasService } from '../../src/cameras/cameras.service';
import { TagCacheService } from '../../src/cameras/tag-cache.service';

/**
 * Phase 22 Plan 22-06 — POST /cameras/bulk/tags Add/Remove + per-camera audit (D-11, D-12, D-13, D-26).
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   rows 22-W1-BULK / 22-W1-BULK-AUDIT — D-11/D-12/D-13/D-26 — bulk tag op + per-camera audit
 *   threat: T-22-01 (RLS — bulk operation must not cross orgs),
 *           T-22-08 (audit forgery via diff)
 *
 * Test strategy: hybrid pattern matching audit-diff.test.ts (Plan 22-04).
 *   • Real testPrisma drives camera lifecycle so the Prisma extension auto-
 *     populates `tagsNormalized` on every per-row update — pinning Pitfall 5
 *     (the bulk operation MUST use per-camera update() for the extension to fire).
 *   • Mocked auditService captures per-camera log() calls so we can assert the
 *     details.diff shape for each affected camera per D-26.
 *   • TagCacheService is real (memory-only) so we can verify the invalidate()
 *     is called after a bulk write and that the next findDistinctTags returns
 *     fresh data.
 *
 * Sampling rate: per-task quick run
 *   `pnpm --filter @sms-platform/api test -- tests/cameras/bulk-tags.test.ts`
 */

async function cleanupCameraData(prisma: any) {
  await prisma.camera.deleteMany();
  await prisma.site.deleteMany();
  await prisma.project.deleteMany();
}

describe('Phase 22 Plan 22-06 — bulkTagAction service method (D-11, D-12, D-26)', () => {
  let service: CamerasService;
  let orgId: string;
  let siteId: string;
  let auditService: { log: ReturnType<typeof vi.fn> };
  let tagCache: TagCacheService;

  beforeEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);

    const pkg = await createTestPackage(testPrisma, { maxCameras: 50 });
    const org = await createTestOrganization(testPrisma, { packageId: pkg.id });
    orgId = org.id;

    auditService = { log: vi.fn().mockResolvedValue(undefined) };
    tagCache = new TagCacheService();
    service = new CamerasService(
      testPrisma as any, // tenancy
      testPrisma as any, // prisma
      undefined as any, // streamsService
      undefined as any, // probeQueue
      undefined, // systemPrisma
      undefined, // srsApi
      auditService as any, // auditService — captured for assertion
      tagCache, // Phase 22 Plan 22-05 — tag cache (Plan 22-06 invalidates this)
    );

    const project = await service.createProject(orgId, {
      name: 'Bulk Tags Project',
    });
    const site = await service.createSite(orgId, project.id, {
      name: 'Bulk Tags Site',
    });
    siteId = site.id;
  });

  afterEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);
  });

  it('Test 1 — Add to multiple cameras: existing tags preserved, new tag appended; per-camera audit row written', async () => {
    const camA = await service.createCamera(orgId, siteId, {
      name: 'Cam-A',
      streamUrl: 'rtsp://test/a',
      tags: ['x'],
    });
    const camB = await service.createCamera(orgId, siteId, {
      name: 'Cam-B',
      streamUrl: 'rtsp://test/b',
      tags: ['y'],
    });
    auditService.log.mockClear();

    const result = await service.bulkTagAction(
      orgId,
      { userId: 'user-1', userEmail: 'u1@test.local' },
      { cameraIds: [camA.id, camB.id], action: 'add', tag: 'lobby' },
    );

    expect(result).toEqual({ updatedCount: 2 });

    // Each camera's `tags` array now contains the new tag, with prior tags preserved.
    const a = await testPrisma.camera.findUnique({ where: { id: camA.id } });
    const b = await testPrisma.camera.findUnique({ where: { id: camB.id } });
    expect(a?.tags).toEqual(['x', 'lobby']);
    expect(b?.tags).toEqual(['y', 'lobby']);

    // D-26: ONE audit row per affected camera (2 total), each carrying details.diff.tags.
    const diffCalls = auditService.log.mock.calls.filter(
      (c: any[]) => c[0]?.details?.diff?.tags !== undefined,
    );
    expect(diffCalls).toHaveLength(2);
    const aDiff = diffCalls.find((c: any[]) => c[0].resourceId === camA.id);
    const bDiff = diffCalls.find((c: any[]) => c[0].resourceId === camB.id);
    expect(aDiff![0].details.diff.tags).toEqual({
      before: ['x'],
      after: ['x', 'lobby'],
    });
    expect(bDiff![0].details.diff.tags).toEqual({
      before: ['y'],
      after: ['y', 'lobby'],
    });
  });

  it('Test 2 — Add idempotent (case-insensitive dedup): camera already has tag → no-op, no audit row', async () => {
    // D-04: case-insensitive equality means "lobby" already exists if any
    // casing of "lobby" is present. The bulk op must NOT add a duplicate
    // entry AND must NOT emit a diff-bearing audit row.
    const cam = await service.createCamera(orgId, siteId, {
      name: 'Cam-Idempotent',
      streamUrl: 'rtsp://test/idem',
      tags: ['Lobby'],
    });
    auditService.log.mockClear();

    const result = await service.bulkTagAction(
      orgId,
      { userId: 'user-1' },
      { cameraIds: [cam.id], action: 'add', tag: 'lobby' },
    );

    expect(result).toEqual({ updatedCount: 0 });

    const after = await testPrisma.camera.findUnique({
      where: { id: cam.id },
    });
    // Original casing preserved (D-04 first-seen casing).
    expect(after?.tags).toEqual(['Lobby']);

    const diffCalls = auditService.log.mock.calls.filter(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(diffCalls).toHaveLength(0);
  });

  it('Test 3 — Remove case-insensitive: removes matching tag regardless of caller-supplied casing', async () => {
    const cam = await service.createCamera(orgId, siteId, {
      name: 'Cam-Remove',
      streamUrl: 'rtsp://test/rm',
      tags: ['Lobby', 'X'],
    });
    auditService.log.mockClear();

    const result = await service.bulkTagAction(
      orgId,
      { userId: 'user-1' },
      { cameraIds: [cam.id], action: 'remove', tag: 'LOBBY' },
    );

    expect(result).toEqual({ updatedCount: 1 });

    const after = await testPrisma.camera.findUnique({
      where: { id: cam.id },
    });
    expect(after?.tags).toEqual(['X']);

    const diffCall = auditService.log.mock.calls.find(
      (c: any[]) => c[0]?.details?.diff?.tags !== undefined,
    );
    expect(diffCall).toBeDefined();
    expect(diffCall![0].details.diff.tags).toEqual({
      before: ['Lobby', 'X'],
      after: ['X'],
    });
  });

  it('Test 4 — Remove no-op: tag not present → camera unchanged, no audit row', async () => {
    const cam = await service.createCamera(orgId, siteId, {
      name: 'Cam-NoopRemove',
      streamUrl: 'rtsp://test/noop',
      tags: ['x'],
    });
    auditService.log.mockClear();

    const result = await service.bulkTagAction(
      orgId,
      { userId: 'user-1' },
      { cameraIds: [cam.id], action: 'remove', tag: 'lobby' },
    );

    expect(result).toEqual({ updatedCount: 0 });

    const after = await testPrisma.camera.findUnique({
      where: { id: cam.id },
    });
    expect(after?.tags).toEqual(['x']);

    const diffCalls = auditService.log.mock.calls.filter(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(diffCalls).toHaveLength(0);
  });

  it('Test 5 — RLS / cross-org isolation: cameraIds in another org silently produce updatedCount=0 (T-22-01)', async () => {
    // Seed Org B + camera in Org B.
    const pkgB = await createTestPackage(testPrisma, { maxCameras: 5 });
    const orgB = await createTestOrganization(testPrisma, {
      name: 'Bulk Tags Org B',
      packageId: pkgB.id,
    });
    const projB = await testPrisma.project.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        name: 'Bulk Tags Project B',
      },
    });
    const siteB = await testPrisma.site.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        projectId: projB.id,
        name: 'Bulk Tags Site B',
      },
    });
    const camB = await testPrisma.camera.create({
      data: {
        id: randomUUID(),
        orgId: orgB.id,
        siteId: siteB.id,
        name: 'Cam-B-Foreign',
        streamUrl: 'rtsp://test/b-foreign',
        tags: ['original'],
        tagsNormalized: ['original'],
        status: 'offline',
      },
    });
    auditService.log.mockClear();

    // The test harness uses the `sms` superuser role (rolbypassrls=true), so
    // the tenancy.camera.findMany inside bulkTagAction will technically see
    // both orgs' rows. Defense-in-depth filtering by orgId inside the service
    // is what mitigates T-22-01 in the test environment.
    //
    // We pass Org A's orgId (the beforeEach orgId) but cameraIds belonging to
    // Org B. Implementation MUST filter by orgId so the foreign camera is
    // skipped — updatedCount must be 0 and the foreign camera's tags must be
    // unchanged. NO audit row is written for the foreign camera.
    const result = await service.bulkTagAction(
      orgId,
      { userId: 'user-1' },
      { cameraIds: [camB.id], action: 'add', tag: 'leak' },
    );

    expect(result).toEqual({ updatedCount: 0 });

    const after = await testPrisma.camera.findUnique({
      where: { id: camB.id },
    });
    // Org B's camera must NOT have been mutated.
    expect(after?.tags).toEqual(['original']);

    const diffCalls = auditService.log.mock.calls.filter(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(diffCalls).toHaveLength(0);

    // Cleanup Org B.
    await testPrisma.camera.delete({ where: { id: camB.id } });
    await testPrisma.site.delete({ where: { id: siteB.id } });
    await testPrisma.project.delete({ where: { id: projB.id } });
    await testPrisma.organization.delete({ where: { id: orgB.id } });
  });

  it('Test 6 — Cache invalidation: bulk add flushes the distinct-tags cache so new tag appears immediately', async () => {
    const cam = await service.createCamera(orgId, siteId, {
      name: 'Cam-Cache',
      streamUrl: 'rtsp://test/cache',
      tags: ['Existing'],
    });

    // Warm the cache by calling findDistinctTags BEFORE the bulk add.
    const before = await service.findDistinctTags(orgId);
    expect(before).toEqual(['Existing']);

    // Spy on tagCache.invalidate to verify it gets called.
    const invalidateSpy = vi.spyOn(tagCache, 'invalidate');

    await service.bulkTagAction(
      orgId,
      { userId: 'user-1' },
      { cameraIds: [cam.id], action: 'add', tag: 'NewTag' },
    );

    // The cache MUST have been invalidated for this org.
    expect(invalidateSpy).toHaveBeenCalledWith(orgId);

    // Subsequent findDistinctTags returns fresh data including the new tag.
    const after = await service.findDistinctTags(orgId);
    expect(after).toContain('NewTag');
    expect(after).toContain('Existing');
  });

  it('Test 7 — Validation surface: empty cameraIds throws / tag too long throws / invalid action throws (DTO + service guard)', async () => {
    // The DTO (`bulkTagsDtoSchema`) enforces validation at the controller
    // boundary. This test imports the schema directly so we can pin its
    // contract without standing up an HTTP harness.
    const { bulkTagsDtoSchema } = await import(
      '../../src/cameras/dto/bulk-tags.dto'
    );

    // Empty cameraIds rejected.
    expect(
      bulkTagsDtoSchema.safeParse({
        cameraIds: [],
        action: 'add',
        tag: 'x',
      }).success,
    ).toBe(false);

    // Tag > 50 chars rejected.
    expect(
      bulkTagsDtoSchema.safeParse({
        cameraIds: [randomUUID()],
        action: 'add',
        tag: 'x'.repeat(51),
      }).success,
    ).toBe(false);

    // Empty tag rejected.
    expect(
      bulkTagsDtoSchema.safeParse({
        cameraIds: [randomUUID()],
        action: 'add',
        tag: '',
      }).success,
    ).toBe(false);

    // Whitespace-only tag rejected (after .trim()).
    expect(
      bulkTagsDtoSchema.safeParse({
        cameraIds: [randomUUID()],
        action: 'add',
        tag: '   ',
      }).success,
    ).toBe(false);

    // Invalid action rejected.
    expect(
      bulkTagsDtoSchema.safeParse({
        cameraIds: [randomUUID()],
        action: 'replace',
        tag: 'x',
      }).success,
    ).toBe(false);

    // Non-uuid cameraId rejected.
    expect(
      bulkTagsDtoSchema.safeParse({
        cameraIds: ['not-a-uuid'],
        action: 'add',
        tag: 'x',
      }).success,
    ).toBe(false);

    // Valid request passes.
    const ok = bulkTagsDtoSchema.safeParse({
      cameraIds: [randomUUID()],
      action: 'add',
      tag: 'lobby',
    });
    expect(ok.success).toBe(true);
  });

  it('Test 8 — tagsNormalized auto-updated by extension on per-camera update (Pitfall 5)', async () => {
    // Pitfall 5: the Prisma extension fires on per-row update() but NOT on
    // updateMany(). bulkTagAction MUST use per-camera update() so the
    // shadow column stays in sync — this is what makes the autocomplete +
    // table-filter MultiSelect see the new tag.
    const cam = await service.createCamera(orgId, siteId, {
      name: 'Cam-Extension',
      streamUrl: 'rtsp://test/ext',
      tags: ['existing'],
    });

    await service.bulkTagAction(
      orgId,
      { userId: 'user-1' },
      { cameraIds: [cam.id], action: 'add', tag: 'NewLobby' },
    );

    const after = await testPrisma.camera.findUnique({
      where: { id: cam.id },
      select: { tags: true, tagsNormalized: true },
    });
    expect(after?.tags).toEqual(['existing', 'NewLobby']);
    // Extension lowercases + dedups for the shadow column.
    expect(after?.tagsNormalized).toEqual(['existing', 'newlobby']);
  });
});
