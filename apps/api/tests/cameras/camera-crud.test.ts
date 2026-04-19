import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
