import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization, createTestPackage } from '../helpers/tenancy';
import { CamerasService } from '../../src/cameras/cameras.service';
import {
  BulkImportCameraSchema,
  BulkImportSchema,
} from '../../src/cameras/dto/bulk-import.dto';
import { buildDuplicateCameras } from '../../src/test-utils/duplicate-fixtures';

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

    service = new CamerasService(
      testPrisma as any,
      testPrisma as any,
      undefined as any,
      undefined as any,
    );

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

    service = new CamerasService(
      testPrisma as any,
      testPrisma as any,
      undefined as any,
      undefined as any,
    );

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
    // CSV row validation — tags is now string[] aligned with single-camera DTO
    // (frontend splits the CSV cell on `,` or `;` before POSTing).
    const row1 = BulkImportCameraSchema.safeParse({
      name: 'Front Door',
      streamUrl: 'rtsp://192.168.1.100/stream1',
      tags: ['entrance', 'outdoor'],
      description: 'Main entrance camera',
      location: { lat: 13.7563, lng: 100.5018 },
    });
    expect(row1.success).toBe(true);
    if (row1.success) {
      expect(row1.data.tags).toEqual(['entrance', 'outdoor']);
      expect(row1.data.location).toEqual({ lat: 13.7563, lng: 100.5018 });
      expect(row1.data.description).toBe('Main entrance camera');
    }
  });

  it('should reject the legacy flat lat/lng shape (regression guard for bulk-import-camera-fields-dropped)', () => {
    // Pre-fix the DTO accepted flat `lat`/`lng` keys but the frontend always
    // sent nested `location: { lat, lng }`. Zod silently stripped `location`
    // and the fields never reached Prisma. After the fix the schema only
    // accepts the nested shape; the flat shape is allowed (extra keys stripped)
    // BUT location is then absent → service writes location: undefined.
    // The persistence test below is the authoritative regression guard.
    const flat = BulkImportCameraSchema.safeParse({
      name: 'Cam',
      streamUrl: 'rtsp://1.1.1.1/s',
      lat: 13.7563,
      lng: 100.5018,
    } as any);
    expect(flat.success).toBe(true);
    if (flat.success) {
      expect((flat.data as any).location).toBeUndefined();
    }
  });

  it('persists location and tags end-to-end (regression guard for bulk-import-camera-fields-dropped)', async () => {
    const result = await service.bulkImport(orgId, {
      cameras: [
        {
          name: 'GeoCam',
          streamUrl: 'rtsp://10.0.5.1/geo',
          location: { lat: 13.7563, lng: 100.5018 },
          tags: ['entrance', 'outdoor'],
          description: 'Front gate, fish-eye',
        },
      ],
      siteId,
    });

    expect(result.imported).toBe(1);

    const persisted = await testPrisma.camera.findFirst({
      where: { siteId, name: 'GeoCam' },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.location).toEqual({ lat: 13.7563, lng: 100.5018 });
    expect(persisted?.tags).toEqual(['entrance', 'outdoor']);
    expect(persisted?.description).toBe('Front gate, fish-eye');
  });

  it('should parse JSON array of camera objects', () => {
    const jsonInput = [
      { name: 'Cam A', streamUrl: 'rtsp://10.0.0.1/a' },
      { name: 'Cam B', streamUrl: 'srt://10.0.0.2:10080' },
    ];

    const results = jsonInput.map((row) => BulkImportCameraSchema.safeParse(row));
    expect(results.every((r) => r.success)).toBe(true);
  });

  // ─── Default StreamProfile assignment (regression guard for ─────
  //     bulk-import-default-profile-not-assigned) ─────────────────

  it('assigns the org default StreamProfile to every imported row when none is supplied', async () => {
    const defaultProfile = await testPrisma.streamProfile.create({
      data: { orgId, name: 'Org Default', isDefault: true },
    });

    const result = await service.bulkImport(orgId, {
      cameras: [
        { name: 'DefCam1', streamUrl: 'rtsp://10.0.9.1/s1' },
        { name: 'DefCam2', streamUrl: 'rtsp://10.0.9.2/s2' },
      ],
      siteId,
    });

    expect(result.imported).toBe(2);

    const persisted = await testPrisma.camera.findMany({
      where: { siteId, name: { in: ['DefCam1', 'DefCam2'] } },
      orderBy: { name: 'asc' },
    });
    expect(persisted).toHaveLength(2);
    expect(persisted[0].streamProfileId).toBe(defaultProfile.id);
    expect(persisted[1].streamProfileId).toBe(defaultProfile.id);
  });

  it('per-row streamProfileId wins over the org default', async () => {
    const defaultProfile = await testPrisma.streamProfile.create({
      data: { orgId, name: 'Org Default', isDefault: true },
    });
    const customProfile = await testPrisma.streamProfile.create({
      data: { orgId, name: 'Custom', isDefault: false },
    });

    const result = await service.bulkImport(orgId, {
      cameras: [
        { name: 'OverrideCam', streamUrl: 'rtsp://10.0.9.3/s3', streamProfileId: customProfile.id },
        { name: 'DefaultCam', streamUrl: 'rtsp://10.0.9.4/s4' },
      ],
      siteId,
    });

    expect(result.imported).toBe(2);

    const override = await testPrisma.camera.findFirst({ where: { siteId, name: 'OverrideCam' } });
    const defaulted = await testPrisma.camera.findFirst({ where: { siteId, name: 'DefaultCam' } });
    expect(override?.streamProfileId).toBe(customProfile.id);
    expect(defaulted?.streamProfileId).toBe(defaultProfile.id);
  });

  it('leaves streamProfileId null when the org has no default profile (no throw)', async () => {
    // No StreamProfile rows for this org — runtime fallback in PoliciesService.resolve
    // handles playback; UI just shows blank. Throwing here would block bulk import for
    // orgs that never set a default, which is worse than the current state.
    const result = await service.bulkImport(orgId, {
      cameras: [{ name: 'NoDefaultCam', streamUrl: 'rtsp://10.0.9.5/s5' }],
      siteId,
    });

    expect(result.imported).toBe(1);

    const persisted = await testPrisma.camera.findFirst({
      where: { siteId, name: 'NoDefaultCam' },
    });
    expect(persisted?.streamProfileId).toBeNull();
  });
});

async function cleanupCameraData(prisma: any) {
  await prisma.camera.deleteMany();
  await prisma.site.deleteMany();
  await prisma.project.deleteMany();
}

describe('bulkImport server-side dedup — Phase 19 (D-10b)', () => {
  let service: CamerasService;
  let orgId: string;
  let siteId: string;

  beforeEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);

    const pkg = await createTestPackage(testPrisma, { maxCameras: 50 });
    const org = await createTestOrganization(testPrisma, { packageId: pkg.id });
    orgId = org.id;

    service = new CamerasService(
      testPrisma as any,
      testPrisma as any,
      undefined as any,
      undefined as any,
    );

    const project = await service.createProject(orgId, { name: 'Dedup Project' });
    const site = await service.createSite(orgId, project.id, { name: 'Dedup Site' });
    siteId = site.id;
  });

  afterEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);
  });

  it('skips rows whose streamUrl already exists in the same org (against-db pre-check)', async () => {
    // Seed one pre-existing camera.
    await service.createCamera(orgId, siteId, {
      name: 'Existing',
      streamUrl: 'rtsp://host/a',
    });

    const result = await service.bulkImport(orgId, {
      cameras: [
        { name: 'Retry', streamUrl: 'rtsp://host/a' },
        { name: 'New', streamUrl: 'rtsp://host/new' },
      ],
      siteId,
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);

    // Only the one truly-new row must exist, plus the pre-seeded 'Existing'.
    const inSite = await testPrisma.camera.findMany({
      where: { siteId },
      orderBy: { name: 'asc' },
    });
    expect(inSite.map((c) => c.name).sort()).toEqual(['Existing', 'New']);
  });

  it('skips within-file duplicates (D-10a server-side mirror)', async () => {
    // buildDuplicateCameras: [A, B=dup(A), C=unique, D=dup(A)]
    const cameras = buildDuplicateCameras(orgId);
    const result = await service.bulkImport(orgId, { cameras, siteId });

    // A (first) + C (unique) import; B + D are within-file dupes of A.
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(2);

    const inDb = await testPrisma.camera.findMany({
      where: { siteId },
      select: { name: true, streamUrl: true },
      orderBy: { name: 'asc' },
    });
    expect(inDb).toEqual([
      { name: 'A', streamUrl: 'rtsp://host/a' },
      { name: 'C', streamUrl: 'rtmp://host/c' },
    ]);
  });

  it('tenant isolation: same streamUrl in different orgs is NOT a duplicate', async () => {
    // Seed the URL under a SECOND org first.
    const pkgB = await createTestPackage(testPrisma, { maxCameras: 10, name: 'BasicB' });
    const orgB = await createTestOrganization(testPrisma, {
      packageId: pkgB.id,
      name: 'Org B',
      slug: 'org-b-dedup',
    });
    const projectB = await service.createProject(orgB.id, { name: 'Org B Project' });
    const siteB = await service.createSite(orgB.id, projectB.id, { name: 'Org B Site' });
    await service.createCamera(orgB.id, siteB.id, {
      name: 'OrgB cam',
      streamUrl: 'rtsp://shared/url',
    });

    // Now bulk-import the same URL into the original org — must succeed.
    const result = await service.bulkImport(orgId, {
      cameras: [{ name: 'OrgA same url', streamUrl: 'rtsp://shared/url' }],
      siteId,
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);

    const orgACam = await testPrisma.camera.findFirst({
      where: { orgId, streamUrl: 'rtsp://shared/url' },
    });
    expect(orgACam).not.toBeNull();
  });

  it('response shape includes imported + skipped + errors + cameras', async () => {
    const result = await service.bulkImport(orgId, {
      cameras: [{ name: 'Unique1', streamUrl: 'rtsp://unique/1' }],
      siteId,
    });

    // D-14 (phase 19.1): response now includes `cameras[]` so the bulk-import
    // dialog can render a client-side CSV download of generated push URLs.
    // Pull rows also appear in the array (with their existing streamUrl);
    // the frontend filters to push-mode rows.
    expect(Object.keys(result).sort()).toEqual([
      'cameras',
      'errors',
      'imported',
      'skipped',
    ]);
    expect(result).toMatchObject({ imported: 1, skipped: 0, errors: [] });
    expect(result.cameras).toHaveLength(1);
    expect(result.cameras[0]).toMatchObject({
      name: 'Unique1',
      ingestMode: 'pull',
      streamUrl: 'rtsp://unique/1',
    });
  });

  it('P2002 race safety: concurrent duplicate insert translates to DuplicateStreamUrlError', async () => {
    // Simulate the race by pre-seeding via a direct Prisma write AFTER the
    // pre-check window would have run but BEFORE the transaction tries to
    // insert. The cleanest way to exercise this in a unit test is to mock
    // tenancy.$transaction — point it at a client whose camera.create
    // unconditionally rejects with a P2002 on streamUrl.
    const { Prisma } = await import('@prisma/client');
    const mockTenancy: any = {
      site: { findUnique: async () => ({ id: siteId }) },
      camera: {
        findMany: async () => [], // pretend nothing exists yet
        count: async () => 0,
      },
      streamProfile: {
        findFirst: async () => null,
      },
      $transaction: async (_cb: any) => {
        // Throw a Prisma P2002 as if the unique constraint fired between
        // the pre-check (empty) and the insert.
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          {
            code: 'P2002',
            clientVersion: '6.0.0',
            meta: { target: ['orgId', 'streamUrl'] },
          } as any,
        );
      },
    };
    const mockPrisma: any = {
      organization: {
        findUnique: async () => ({ package: { maxCameras: 50 } }),
      },
    };

    const raceService = new CamerasService(
      mockTenancy,
      mockPrisma,
      undefined as any,
      undefined as any,
    );

    await expect(
      raceService.bulkImport(orgId, {
        cameras: [{ name: 'Racey', streamUrl: 'rtsp://race/1' }],
        siteId,
      }),
    ).rejects.toMatchObject({
      response: { code: 'DUPLICATE_STREAM_URL' },
    });
  });

  it('quick-260426-lg5: P2002 race on (orgId, name) translates to DuplicateCameraNameError', async () => {
    const { Prisma } = await import('@prisma/client');
    const mockTenancy: any = {
      site: { findUnique: async () => ({ id: siteId }) },
      camera: {
        findMany: async () => [],
        count: async () => 0,
      },
      streamProfile: {
        findFirst: async () => null,
      },
      $transaction: async (_cb: any) => {
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          {
            code: 'P2002',
            clientVersion: '6.0.0',
            meta: { target: ['orgId', 'name'] },
          } as any,
        );
      },
    };
    const mockPrisma: any = {
      organization: {
        findUnique: async () => ({ package: { maxCameras: 50 } }),
      },
    };

    const raceService = new CamerasService(
      mockTenancy,
      mockPrisma,
      undefined as any,
      undefined as any,
    );

    await expect(
      raceService.bulkImport(orgId, {
        cameras: [{ name: 'Racey Name', streamUrl: 'rtsp://race-name/1' }],
        siteId,
      }),
    ).rejects.toMatchObject({
      response: { code: 'DUPLICATE_CAMERA_NAME' },
    });
  });
});

describe('Phase 19 — BulkImport 4-protocol allowlist (D-12, D-17)', () => {
  it('accepts rtmp:// URLs (D-12 RTMP unblock)', async () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Cam',
      streamUrl: 'rtmp://rtmp.example.com/live/stream',
    });
    expect(result.success).toBe(true);
  });

  it('accepts rtmps:// URLs', async () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Cam',
      streamUrl: 'rtmps://rtmp.example.com/live/stream',
    });
    expect(result.success).toBe(true);
  });

  it('rejects http:// URLs with allowlist message', async () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Cam',
      streamUrl: 'http://evil.example/stream',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('rtsp://, rtmps://, rtmp://, or srt://');
    }
  });

  it('rejects javascript: URLs (T-19-01 SSRF/XSS surface)', async () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Cam',
      streamUrl: 'javascript:alert(1)',
    });
    expect(result.success).toBe(false);
  });

  it('rejects file:// URLs (T-19-01 local file read)', async () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Cam',
      streamUrl: 'file:///etc/passwd',
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed URLs via .url() floor (D-17)', async () => {
    const result = BulkImportCameraSchema.safeParse({
      name: 'Cam',
      streamUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});
