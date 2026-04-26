import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization, createTestPackage } from '../helpers/tenancy';
import { CamerasService } from '../../src/cameras/cameras.service';
import { CreateCameraSchema } from '../../src/cameras/dto/create-camera.dto';

describe('Camera CRUD', () => {
  let service: CamerasService;
  let orgId: string;
  let siteId: string;

  beforeEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);

    const pkg = await createTestPackage(testPrisma, { maxCameras: 3 });
    const org = await createTestOrganization(testPrisma, { packageId: pkg.id });
    orgId = org.id;

    service = new CamerasService(
      testPrisma as any,
      testPrisma as any,
      undefined as any,
      undefined as any,
    );

    const project = await service.createProject(orgId, { name: 'Test Project' });
    const site = await service.createSite(orgId, project.id, { name: 'Test Site' });
    siteId = site.id;
  });

  afterEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);
  });

  it('should create a camera with required fields and status offline', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Front Door',
      streamUrl: 'rtsp://192.168.1.100/stream1',
    });

    expect(camera.id).toBeDefined();
    expect(camera.orgId).toBe(orgId);
    expect(camera.siteId).toBe(siteId);
    expect(camera.name).toBe('Front Door');
    expect(camera.streamUrl).toBe('rtsp://192.168.1.100/stream1');
    expect(camera.status).toBe('offline');
    expect(camera.needsTranscode).toBe(false);
  });

  it('should reject camera creation without valid site', async () => {
    await expect(
      service.createCamera(orgId, 'non-existent-site', {
        name: 'Bad Camera',
        streamUrl: 'rtsp://192.168.1.100/stream1',
      }),
    ).rejects.toThrow();
  });

  it('should enforce maxCameras package limit', async () => {
    // Package limit is 3
    await service.createCamera(orgId, siteId, { name: 'Cam1', streamUrl: 'rtsp://1.1.1.1/s1' });
    await service.createCamera(orgId, siteId, { name: 'Cam2', streamUrl: 'rtsp://1.1.1.2/s2' });
    await service.createCamera(orgId, siteId, { name: 'Cam3', streamUrl: 'rtsp://1.1.1.3/s3' });

    await expect(
      service.createCamera(orgId, siteId, { name: 'Cam4', streamUrl: 'rtsp://1.1.1.4/s4' }),
    ).rejects.toThrow(/camera limit/i);
  });

  it('should list all cameras for org', async () => {
    await service.createCamera(orgId, siteId, { name: 'Cam1', streamUrl: 'rtsp://1.1.1.1/s1' });
    await service.createCamera(orgId, siteId, { name: 'Cam2', streamUrl: 'rtsp://1.1.1.2/s2' });

    const cameras = await service.findAllCameras();
    expect(cameras.length).toBeGreaterThanOrEqual(2);
  });

  it('should find camera by id with site and project relations', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Detail Cam',
      streamUrl: 'rtsp://1.1.1.1/detail',
    });

    const found = await service.findCameraById(camera.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Detail Cam');
    expect(found!.site).toBeDefined();
    expect(found!.site.project).toBeDefined();
  });

  it('should update camera fields', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Old Name',
      streamUrl: 'rtsp://1.1.1.1/old',
    });

    const updated = await service.updateCamera(camera.id, {
      name: 'New Name',
      description: 'Updated desc',
    });

    expect(updated.name).toBe('New Name');
    expect(updated.description).toBe('Updated desc');
    expect(updated.streamUrl).toBe('rtsp://1.1.1.1/old'); // preserved
  });

  it('should delete camera', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'ToDelete',
      streamUrl: 'rtsp://1.1.1.1/del',
    });

    await service.deleteCamera(camera.id);

    const found = await testPrisma.camera.findUnique({ where: { id: camera.id } });
    expect(found).toBeNull();
  });

  it('should validate stream URL format via DTO schema', () => {
    const invalid = CreateCameraSchema.safeParse({
      name: 'Bad',
      streamUrl: 'http://invalid.com/stream',
    });
    expect(invalid.success).toBe(false);

    const validRtsp = CreateCameraSchema.safeParse({
      name: 'Good',
      streamUrl: 'rtsp://192.168.1.1/stream',
    });
    expect(validRtsp.success).toBe(true);

    const validSrt = CreateCameraSchema.safeParse({
      name: 'Good',
      streamUrl: 'srt://192.168.1.1:10080',
    });
    expect(validSrt.success).toBe(true);
  });

  it('should create camera with optional fields', async () => {
    const camera = await service.createCamera(orgId, siteId, {
      name: 'Full Camera',
      streamUrl: 'rtsp://192.168.1.100/stream1',
      description: 'Main entrance camera',
      location: { lat: 13.7563, lng: 100.5018 },
      tags: ['entrance', 'outdoor'],
    });

    expect(camera.description).toBe('Main entrance camera');
    expect(camera.location).toEqual({ lat: 13.7563, lng: 100.5018 });
    expect(camera.tags).toEqual(['entrance', 'outdoor']);
  });
});

async function cleanupCameraData(prisma: any) {
  await prisma.camera.deleteMany();
  await prisma.site.deleteMany();
  await prisma.project.deleteMany();
}

describe('createCamera probe enqueue — Phase 19 (D-01, D-04)', () => {
  // All entries are it.todo stubs — Wave 1-2 tasks convert them to real tests.
  it.todo('enqueues probe:{cameraId} job after successful commit');
  it.todo('skips enqueue silently when probeQueue is undefined (test env)');
  it.todo('does not block the response on probe completion (returns immediately)');
});

describe('createCamera duplicate detection — Phase 19 (D-11)', () => {
  let service: CamerasService;
  let orgId: string;
  let siteId: string;

  beforeEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);

    const pkg = await createTestPackage(testPrisma, { maxCameras: 10 });
    const org = await createTestOrganization(testPrisma, { packageId: pkg.id });
    orgId = org.id;

    service = new CamerasService(
      testPrisma as any,
      testPrisma as any,
      undefined as any,
      undefined as any,
    );

    const project = await service.createProject(orgId, { name: 'Dup Project' });
    const site = await service.createSite(orgId, project.id, { name: 'Dup Site' });
    siteId = site.id;
  });

  afterEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);
  });

  it('throws DuplicateStreamUrlError (409) when P2002 fires on streamUrl target', async () => {
    await service.createCamera(orgId, siteId, {
      name: 'First',
      streamUrl: 'rtsp://dup/a',
    });

    await expect(
      service.createCamera(orgId, siteId, {
        name: 'Second',
        streamUrl: 'rtsp://dup/a',
      }),
    ).rejects.toMatchObject({
      response: { code: 'DUPLICATE_STREAM_URL' },
    });
  });

  it('does NOT translate P2002 when target is a different unique (e.g., future slug)', async () => {
    // Fabricate a P2002 whose meta.target is NOT 'streamUrl' so the service
    // should re-throw the original Prisma error rather than wrap it in
    // DuplicateStreamUrlError. We stub the tenancy client's camera.create
    // for this one test; all other calls (site.findUnique) still hit the
    // real testPrisma.
    const siteRow = await testPrisma.site.findUnique({ where: { id: siteId } });
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: '6.0.0',
      meta: { target: ['slug'] },
    });
    const mockTenancy = {
      site: { findUnique: vi.fn().mockResolvedValue(siteRow) },
      camera: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockRejectedValue(p2002),
      },
    };
    const rawLikePrisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue(null), // no package → no limit
      },
    };
    const mockedService = new CamerasService(
      mockTenancy as any,
      rawLikePrisma as any,
      undefined as any,
      undefined as any,
    );

    await expect(
      mockedService.createCamera(orgId, siteId, {
        name: 'X',
        streamUrl: 'rtsp://x/1',
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('error body contains code: "DUPLICATE_STREAM_URL" and HTTP 409', async () => {
    await service.createCamera(orgId, siteId, {
      name: 'A',
      streamUrl: 'rtsp://dup/b',
    });

    try {
      await service.createCamera(orgId, siteId, {
        name: 'B',
        streamUrl: 'rtsp://dup/b',
      });
      expect.fail('Expected DuplicateStreamUrlError');
    } catch (err: any) {
      expect(err.response?.code).toBe('DUPLICATE_STREAM_URL');
      expect(err.response?.streamUrl).toBe('rtsp://dup/b');
      expect(err.getStatus()).toBe(409);
    }
  });
});

describe('createCamera duplicate name detection — quick 260426-lg5', () => {
  let service: CamerasService;
  let orgId: string;
  let siteId: string;
  let secondSiteId: string;

  beforeEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);

    const pkg = await createTestPackage(testPrisma, { maxCameras: 10 });
    const org = await createTestOrganization(testPrisma, { packageId: pkg.id });
    orgId = org.id;

    service = new CamerasService(
      testPrisma as any,
      testPrisma as any,
      undefined as any,
      undefined as any,
    );

    const project = await service.createProject(orgId, { name: 'DupName Project' });
    const site = await service.createSite(orgId, project.id, { name: 'Site A' });
    siteId = site.id;
    const site2 = await service.createSite(orgId, project.id, { name: 'Site B' });
    secondSiteId = site2.id;
  });

  afterEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);
  });

  it('throws DuplicateCameraNameError (409) when same name reused in same org (different site)', async () => {
    await service.createCamera(orgId, siteId, {
      name: 'Front Door',
      streamUrl: 'rtsp://dupname/a',
    });

    await expect(
      service.createCamera(orgId, secondSiteId, {
        name: 'Front Door',
        streamUrl: 'rtsp://dupname/b',
      }),
    ).rejects.toMatchObject({
      response: { code: 'DUPLICATE_CAMERA_NAME' },
    });
  });

  it('error body contains code, message, and conflicting name; HTTP 409', async () => {
    await service.createCamera(orgId, siteId, {
      name: 'Lobby Cam',
      streamUrl: 'rtsp://dupname/c',
    });

    try {
      await service.createCamera(orgId, siteId, {
        name: 'Lobby Cam',
        streamUrl: 'rtsp://dupname/d',
      });
      expect.fail('Expected DuplicateCameraNameError');
    } catch (err: any) {
      expect(err.response?.code).toBe('DUPLICATE_CAMERA_NAME');
      expect(err.response?.message).toMatch(/already exists/i);
      expect(err.response?.name).toBe('Lobby Cam');
      expect(err.getStatus()).toBe(409);
    }
  });
});
