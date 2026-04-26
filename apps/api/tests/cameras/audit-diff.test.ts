import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testPrisma } from '../setup';
import {
  cleanupTestData,
  createTestOrganization,
  createTestPackage,
} from '../helpers/tenancy';
import { CamerasService } from '../../src/cameras/cameras.service';

/**
 * Phase 22 Plan 22-04 — Camera UPDATE diff in details.diff (D-24, D-25).
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W1-AUDIT — D-24/D-25 — UPDATE diff in details.diff for changed fields only (tags + description),
 *   CREATE keeps the standard details blob (no diff).
 *
 * Test layer: hybrid pattern matching push-audit.test.ts.
 *   • Real testPrisma drives the camera lifecycle so pre/updated rows are
 *     actually written, with `tags` preserved verbatim per D-04.
 *   • Mocked `auditService` captures the log() calls so we can assert the
 *     details.diff shape per case without supertest infrastructure (the API
 *     test suite does not stand up an HTTP server — direct service calls
 *     are the existing convention).
 *
 * Why hybrid: the diff is computed in the service layer (D-24 lives in
 * cameras.service.ts updateCamera), so it is captured by the mocked log()
 * call — no AuditLog row inspection is needed to verify the contract.
 * Database isolation is preserved by `cleanupTestData` between cases.
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/cameras/audit-diff.test.ts`)
 */

async function cleanupCameraData(prisma: any) {
  await prisma.camera.deleteMany();
  await prisma.site.deleteMany();
  await prisma.project.deleteMany();
}

describe('Phase 22 Plan 22-04 — Camera UPDATE diff in details.diff (D-24)', () => {
  let service: CamerasService;
  let orgId: string;
  let siteId: string;
  let auditService: { log: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);

    const pkg = await createTestPackage(testPrisma, { maxCameras: 10 });
    const org = await createTestOrganization(testPrisma, { packageId: pkg.id });
    orgId = org.id;

    auditService = { log: vi.fn().mockResolvedValue(undefined) };
    service = new CamerasService(
      testPrisma as any, // tenancy
      testPrisma as any, // prisma
      undefined as any, // streamsService
      undefined as any, // probeQueue
      undefined, // systemPrisma
      undefined, // srsApi
      auditService as any, // auditService — captured for assertion
    );

    const project = await service.createProject(orgId, {
      name: 'Audit Diff Project',
    });
    const site = await service.createSite(orgId, project.id, {
      name: 'Audit Diff Site',
    });
    siteId = site.id;
  });

  afterEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);
  });

  it('Test 1 — tag change emits diff.tags = {before, after}; description absent', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Cam-T1',
      streamUrl: 'rtsp://test/t1',
      tags: ['Outdoor'],
    });
    auditService.log.mockClear(); // ignore CREATE-side audit calls (push key gen, etc.)

    await service.updateCamera(camera.id, { tags: ['Lobby'] });

    // Find the UPDATE-side audit call carrying details.diff (the only call
    // the service emits for tag/description changes).
    const updateCall = auditService.log.mock.calls.find(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0].details.diff.tags).toEqual({
      before: ['Outdoor'],
      after: ['Lobby'],
    });
    expect(updateCall![0].details.diff.description).toBeUndefined();
  });

  it('Test 2 — description change emits diff.description = {before, after}; tags absent', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Cam-T2',
      streamUrl: 'rtsp://test/t2',
      description: 'Old',
    });
    auditService.log.mockClear();

    await service.updateCamera(camera.id, { description: 'New' });

    const updateCall = auditService.log.mock.calls.find(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0].details.diff.description).toEqual({
      before: 'Old',
      after: 'New',
    });
    expect(updateCall![0].details.diff.tags).toBeUndefined();
  });

  it('Test 3 — both fields changed emits diff.tags AND diff.description', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Cam-T3',
      streamUrl: 'rtsp://test/t3',
      tags: ['Old'],
      description: 'Old desc',
    });
    auditService.log.mockClear();

    await service.updateCamera(camera.id, {
      tags: ['New'],
      description: 'New desc',
    });

    const updateCall = auditService.log.mock.calls.find(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0].details.diff.tags).toEqual({
      before: ['Old'],
      after: ['New'],
    });
    expect(updateCall![0].details.diff.description).toEqual({
      before: 'Old desc',
      after: 'New desc',
    });
  });

  it('Test 4 — UPDATE with no relevant change emits NO audit row with details.diff (D-24)', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Cam-T4-OldName',
      streamUrl: 'rtsp://test/t4',
      tags: ['Existing'],
      description: 'Existing desc',
    });
    auditService.log.mockClear();

    // Only `name` changes — no tag/description change should produce no
    // diff-bearing audit call from the service layer.
    await service.updateCamera(camera.id, { name: 'Cam-T4-NewName' });

    const diffCall = auditService.log.mock.calls.find(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(diffCall).toBeUndefined();
  });

  it('Test 5 — case-only tag change is a no-op for diff (case-insensitive equality, D-04)', async () => {
    // Per D-04, `tags` is the canonical display value (first-seen casing
    // preserved). The Phase 22 normalization extension stores tagsNormalized
    // as lowercase, so a case-only change is a no-op for the indexed shadow
    // column. The audit diff follows the same rule: arraysEqualCaseInsensitive
    // returns true so no diff is emitted — pinning the contract that the
    // user's INTENDED change is a no-op when it would only differ in casing.
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Cam-T5',
      streamUrl: 'rtsp://test/t5',
      tags: ['Lobby'],
    });
    auditService.log.mockClear();

    await service.updateCamera(camera.id, { tags: ['LOBBY'] });

    const diffCall = auditService.log.mock.calls.find(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(diffCall).toBeUndefined();
  });

  it('Test 6 — empty → tags change emits diff.tags with before:[], after:[...]', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Cam-T6',
      streamUrl: 'rtsp://test/t6',
      tags: [],
    });
    auditService.log.mockClear();

    await service.updateCamera(camera.id, { tags: ['New'] });

    const updateCall = auditService.log.mock.calls.find(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0].details.diff.tags).toEqual({
      before: [],
      after: ['New'],
    });
  });

  it('Test 7 — CREATE has no diff (D-25): camera.create emits no diff-bearing audit row', async () => {
    // D-25: CREATE keeps its standard details blob — no diff added. The
    // service-side audit calls fired during createCamera (e.g., key_generated
    // for push) MUST NOT contain a details.diff key.
    auditService.log.mockClear();
    await service.createCamera(orgId, siteId, {
      name: 'Cam-T7-Create',
      streamUrl: 'rtsp://test/t7',
      tags: ['x'],
      description: 'y',
    });

    // No service-level audit call should carry details.diff for a CREATE.
    // (The interceptor records the request body separately — that's outside
    // this contract; we only assert what the service emits.)
    const diffCall = auditService.log.mock.calls.find(
      (c: any[]) => c[0]?.details?.diff !== undefined,
    );
    expect(diffCall).toBeUndefined();
  });
});
