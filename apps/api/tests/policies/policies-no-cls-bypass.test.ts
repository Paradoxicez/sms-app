/**
 * 260426-28m: PoliciesService.resolve must be resilient to background callers
 * that have no active CLS context.
 *
 * Background:
 *   PlaybackService.createSystemSession (snapshot pipeline) calls
 *   policiesService.resolve(cameraId) outside any AuthGuard'd HTTP request.
 *   Without an active CLS scope, the tenancy extension never emits the
 *   set_config('app.is_superuser','true') prologue, so RLS closes-by-default
 *   and the camera lookup at policies.service.ts returns null —
 *   `NotFoundException("Camera ${cameraId} not found")`.
 *
 *   This file pins the fix: when CLS is empty, resolve() wraps its body in
 *   `cls.run + IS_SUPERUSER='true'` (the same idiom as onModuleInit) AND
 *   emits a single debug log line referencing the cameraId. When CLS is
 *   already active (HTTP path), resolve() is unchanged and emits NO bypass
 *   log.
 *
 * See: .planning/quick/260426-28m-policiesservice-resolve-no-cls-context-b/260426-28m-PLAN.md
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AsyncLocalStorage } from 'async_hooks';
import { ClsService } from 'nestjs-cls';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization } from '../helpers/tenancy';
import { PoliciesService } from '../../src/policies/policies.service';

async function createCameraHierarchy(
  prisma: typeof testPrisma,
  orgId: string,
) {
  const project = await prisma.project.create({
    data: { orgId, name: 'No-CLS Project' },
  });
  const site = await prisma.site.create({
    data: { orgId, projectId: project.id, name: 'No-CLS Site' },
  });
  const camera = await prisma.camera.create({
    data: {
      orgId,
      siteId: site.id,
      name: 'No-CLS Camera',
      streamUrl: 'rtsp://test:554/no-cls-stream',
    },
  });
  return { project, site, camera };
}

async function seedSystemDefault(prisma: typeof testPrisma) {
  await prisma.policy.create({
    data: {
      level: 'SYSTEM',
      name: 'System Default',
      orgId: null,
      ttlSeconds: 7200,
      maxViewers: 10,
      domains: [],
      allowNoReferer: true,
      rateLimit: 100,
    },
  });
}

function makeService() {
  const cls = new ClsService(new AsyncLocalStorage());
  const service = new PoliciesService(testPrisma as any, cls);
  const debugSpy = vi.spyOn((service as any).logger, 'debug');
  return { cls, service, debugSpy };
}

describe('260426-28m: PoliciesService.resolve no-CLS-context bypass', () => {
  beforeEach(async () => {
    await cleanupTestData(testPrisma);
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
    vi.restoreAllMocks();
  });

  it('Test A: resolves successfully and emits bypass debug log when called with NO active CLS context', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);
    await seedSystemDefault(testPrisma);

    const { cls, service, debugSpy } = makeService();

    // Sanity: there is no active CLS context outside any cls.run wrapper.
    expect(cls.isActive()).toBe(false);

    const resolved = await service.resolve(camera.id);

    expect(resolved.ttlSeconds).toBe(7200);
    expect(resolved.maxViewers).toBe(10);
    expect(resolved.domains).toEqual([]);
    expect(resolved.allowNoReferer).toBe(true);
    expect(resolved.rateLimit).toBe(100);
    expect(resolved.sources).toEqual({
      ttlSeconds: 'SYSTEM',
      maxViewers: 'SYSTEM',
      domains: 'SYSTEM',
      allowNoReferer: 'SYSTEM',
      rateLimit: 'SYSTEM',
    });

    // The bypass branch was taken — a single debug log line referencing
    // the cameraId was emitted.
    const bypassCalls = debugSpy.mock.calls.filter((call) =>
      String(call[0] ?? '').includes('No CLS context'),
    );
    expect(bypassCalls.length).toBeGreaterThan(0);
    expect(String(bypassCalls[0][0])).toContain(camera.id);
  });

  it('Test B: resolves successfully and emits NO bypass log when called inside an active CLS context (HTTP-style ORG_ID set)', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);
    await seedSystemDefault(testPrisma);

    const { cls, service, debugSpy } = makeService();

    const resolved = await cls.run(async () => {
      cls.set('ORG_ID', org.id);
      expect(cls.isActive()).toBe(true);
      return service.resolve(camera.id);
    });

    expect(resolved.ttlSeconds).toBe(7200);
    expect(resolved.maxViewers).toBe(10);
    expect(resolved.domains).toEqual([]);
    expect(resolved.allowNoReferer).toBe(true);
    expect(resolved.rateLimit).toBe(100);

    // The HTTP-context branch was taken — the bypass log MUST NOT be emitted.
    const bypassCalls = debugSpy.mock.calls.filter((call) =>
      String(call[0] ?? '').includes('No CLS context'),
    );
    expect(bypassCalls.length).toBe(0);
  });
});
