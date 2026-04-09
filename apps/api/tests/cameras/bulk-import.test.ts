import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization, createTestPackage } from '../helpers/tenancy';
import { CamerasService } from '../../src/cameras/cameras.service';
import {
  BulkImportCameraSchema,
  BulkImportSchema,
} from '../../src/cameras/dto/bulk-import.dto';

describe('Bulk Camera Import', () => {
  let service: CamerasService;
  let orgId: string;
  let siteId: string;

  beforeEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);

    const pkg = await createTestPackage(testPrisma, { maxCameras: 10 });
    const org = await createTestOrganization(testPrisma, { packageId: pkg.id });
    orgId = org.id;

    service = new CamerasService(testPrisma as any, testPrisma as any);

    const project = await service.createProject(orgId, { name: 'Bulk Project' });
    const site = await service.createSite(orgId, project.id, { name: 'Bulk Site' });
    siteId = site.id;
  });

  afterEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);
  });

  // ─── DTO Validation Tests ──────────────────────

  it('should validate a valid camera row', () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Camera 1',
      streamUrl: 'rtsp://192.168.1.100/stream1',
    });
    expect(result.success).toBe(true);
  });

  it('should reject camera row with missing name', () => {
    const result = BulkImportCameraSchema.safeParse({
      streamUrl: 'rtsp://192.168.1.100/stream1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject camera row with missing streamUrl', () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Camera 1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject camera row with invalid URL format (http)', () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Camera 1',
      streamUrl: 'http://192.168.1.100/stream1',
    });
    expect(result.success).toBe(false);
  });

  it('should accept camera row with srt:// URL', () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Camera 1',
      streamUrl: 'srt://192.168.1.100:10080',
    });
    expect(result.success).toBe(true);
  });

  it('should validate full bulk import payload', () => {
    const result = BulkImportSchema.safeParse({
      cameras: [
        { name: 'Cam1', streamUrl: 'rtsp://1.1.1.1/s1' },
        { name: 'Cam2', streamUrl: 'srt://2.2.2.2:10080' },
      ],
      siteId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should reject bulk import with empty camera array', () => {
    const result = BulkImportSchema.safeParse({
      cameras: [],
      siteId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('should reject bulk import exceeding 500 cameras', () => {
    const cameras = Array.from({ length: 501 }, (_, i) => ({
      name: `Cam${i}`,
      streamUrl: `rtsp://1.1.1.1/s${i}`,
    }));
    const result = BulkImportSchema.safeParse({
      cameras,
      siteId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  // ─── Service Tests ─────────────────────────────

  it('should bulk import cameras with status offline', async () => {
    const result = await service.bulkImport(orgId, {
      cameras: [
        { name: 'BulkCam1', streamUrl: 'rtsp://10.0.0.1/s1' },
        { name: 'BulkCam2', streamUrl: 'rtsp://10.0.0.2/s2' },
        { name: 'BulkCam3', streamUrl: 'srt://10.0.0.3:10080' },
      ],
      siteId,
    });

    expect(result.imported).toBe(3);
    expect(result.errors).toHaveLength(0);

    // Verify cameras in DB
    const cameras = await testPrisma.camera.findMany({
      where: { siteId },
      orderBy: { name: 'asc' },
    });
    expect(cameras).toHaveLength(3);
    expect(cameras[0].status).toBe('offline');
    expect(cameras[1].status).toBe('offline');
    expect(cameras[2].status).toBe('offline');
  });

  it('should check maxCameras limit for total (existing + new)', async () => {
    // Create a package with only 5 cameras allowed
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);

    const pkg = await createTestPackage(testPrisma, { maxCameras: 5 });
    const org = await createTestOrganization(testPrisma, { packageId: pkg.id });
    orgId = org.id;

    service = new CamerasService(testPrisma as any, testPrisma as any);

    const project = await service.createProject(orgId, { name: 'Limited Project' });
    const site = await service.createSite(orgId, project.id, { name: 'Limited Site' });
    siteId = site.id;

    // Add 3 existing cameras
    await service.createCamera(orgId, siteId, { name: 'Existing1', streamUrl: 'rtsp://1.1.1.1/e1' });
    await service.createCamera(orgId, siteId, { name: 'Existing2', streamUrl: 'rtsp://1.1.1.2/e2' });
    await service.createCamera(orgId, siteId, { name: 'Existing3', streamUrl: 'rtsp://1.1.1.3/e3' });

    // Try to bulk import 3 more (3 existing + 3 new = 6 > 5 limit)
    await expect(
      service.bulkImport(orgId, {
        cameras: [
          { name: 'BulkA', streamUrl: 'rtsp://10.0.0.1/a' },
          { name: 'BulkB', streamUrl: 'rtsp://10.0.0.2/b' },
          { name: 'BulkC', streamUrl: 'rtsp://10.0.0.3/c' },
        ],
        siteId,
      }),
    ).rejects.toThrow(/camera limit/i);
  });

  it('should parse CSV-formatted data correctly', () => {
    // CSV row validation
    const row1 = BulkImportCameraSchema.safeParse({
      name: 'Front Door',
      streamUrl: 'rtsp://192.168.1.100/stream1',
      tags: 'entrance,outdoor',
      description: 'Main entrance camera',
    });
    expect(row1.success).toBe(true);
    if (row1.success) {
      expect(row1.data.tags).toBe('entrance,outdoor');
    }
  });

  it('should parse JSON array of camera objects', () => {
    const jsonInput = [
      { name: 'Cam A', streamUrl: 'rtsp://10.0.0.1/a' },
      { name: 'Cam B', streamUrl: 'srt://10.0.0.2:10080' },
    ];

    const results = jsonInput.map((row) => BulkImportCameraSchema.safeParse(row));
    expect(results.every((r) => r.success)).toBe(true);
  });
});

async function cleanupCameraData(prisma: any) {
  await prisma.camera.deleteMany();
  await prisma.site.deleteMany();
  await prisma.project.deleteMany();
}
