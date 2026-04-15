import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData } from '../helpers/tenancy';
import { createTestOrganization } from '../helpers/tenancy';
import { randomUUID } from 'crypto';

/**
 * Helper to create a full camera hierarchy for testing policy resolution.
 */
async function createCameraHierarchy(prisma: typeof testPrisma, orgId: string) {
  const project = await prisma.project.create({
    data: { orgId, name: 'Test Project' },
  });
  const site = await prisma.site.create({
    data: { orgId, projectId: project.id, name: 'Test Site' },
  });
  const camera = await prisma.camera.create({
    data: {
      orgId,
      siteId: site.id,
      name: 'Test Camera',
      streamUrl: 'rtsp://test:554/stream',
    },
  });
  return { project, site, camera };
}

describe('POL-01/POL-02: Policy CRUD and resolution', () => {
  beforeEach(async () => {
    await cleanupTestData(testPrisma);
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('resolve returns system defaults when no specific policies exist', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    // Seed a system default policy
    await testPrisma.policy.create({
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

    // Resolve policy for camera -- should get system defaults
    const resolved = await resolvePolicy(testPrisma, camera.id);

    expect(resolved.ttlSeconds).toBe(7200);
    expect(resolved.maxViewers).toBe(10);
    expect(resolved.domains).toEqual([]);
    expect(resolved.allowNoReferer).toBe(true);
  });

  it('resolve with camera-level TTL returns camera TTL but system maxViewers', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    // System default
    await testPrisma.policy.create({
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

    // Camera-level policy with only TTL overridden
    await testPrisma.policy.create({
      data: {
        level: 'CAMERA',
        name: 'Camera Policy',
        orgId: org.id,
        cameraId: camera.id,
        ttlSeconds: 3600,
        // maxViewers is null (inherit from system)
      },
    });

    const resolved = await resolvePolicy(testPrisma, camera.id);

    expect(resolved.ttlSeconds).toBe(3600); // camera override
    expect(resolved.maxViewers).toBe(10);   // inherited from system
  });

  it('resolve with site-level domains and camera-level empty domains returns camera domains (empty array is valid)', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera, site } = await createCameraHierarchy(testPrisma, org.id);

    // System default
    await testPrisma.policy.create({
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

    // Site-level with domains
    await testPrisma.policy.create({
      data: {
        level: 'SITE',
        name: 'Site Policy',
        orgId: org.id,
        siteId: site.id,
        domains: ['*.example.com'],
      },
    });

    // Camera-level with empty domains (explicitly allow all)
    await testPrisma.policy.create({
      data: {
        level: 'CAMERA',
        name: 'Camera Policy',
        orgId: org.id,
        cameraId: camera.id,
        domains: [], // empty array is a VALID value, not null
      },
    });

    const resolved = await resolvePolicy(testPrisma, camera.id);

    // Camera has domains=[] which is a valid value, so it should override site's domains
    // BUT: domains=[] is the Prisma default, so we need to distinguish "set to empty" vs "not set"
    // Per D-14: empty array = allow all. The camera explicitly set this.
    // The resolution logic needs to handle this: domains field uses array, empty = valid value
    expect(resolved.domains).toEqual([]);
  });

  it('resolve with project maxViewers=0 returns 0 (unlimited)', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera, project } = await createCameraHierarchy(testPrisma, org.id);

    // System default
    await testPrisma.policy.create({
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

    // Project-level with maxViewers=0 (unlimited)
    await testPrisma.policy.create({
      data: {
        level: 'PROJECT',
        name: 'Project Policy',
        orgId: org.id,
        projectId: project.id,
        maxViewers: 0,
      },
    });

    const resolved = await resolvePolicy(testPrisma, camera.id);

    expect(resolved.maxViewers).toBe(0); // 0 = unlimited, not "inherit"
  });

  it('Policy CRUD creates policy with level=CAMERA and cameraId set', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    const policy = await testPrisma.policy.create({
      data: {
        level: 'CAMERA',
        name: 'Camera Policy',
        orgId: org.id,
        cameraId: camera.id,
        ttlSeconds: 1800,
      },
    });

    expect(policy.level).toBe('CAMERA');
    expect(policy.cameraId).toBe(camera.id);
    expect(policy.ttlSeconds).toBe(1800);
  });

  it('only one policy per Camera (unique constraint)', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    await testPrisma.policy.create({
      data: {
        level: 'CAMERA',
        name: 'First Camera Policy',
        orgId: org.id,
        cameraId: camera.id,
      },
    });

    await expect(
      testPrisma.policy.create({
        data: {
          level: 'CAMERA',
          name: 'Second Camera Policy',
          orgId: org.id,
          cameraId: camera.id,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('POL-02: resolve returns sources field with per-field PolicyLevel', () => {
  beforeEach(async () => {
    await cleanupTestData(testPrisma);
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  async function makeService() {
    const { PoliciesService } = await import('../../src/policies/policies.service');
    // Bypass onModuleInit so we control which policies exist.
    return new PoliciesService(testPrisma as any);
  }

  it('A: CAMERA-level policy supplies all scalar fields -> sources all CAMERA', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    await testPrisma.policy.create({
      data: {
        level: 'SYSTEM', name: 'System Default', orgId: null,
        ttlSeconds: 7200, maxViewers: 10, domains: [],
        allowNoReferer: true, rateLimit: 100,
      },
    });
    await testPrisma.policy.create({
      data: {
        level: 'CAMERA', name: 'Cam', orgId: org.id, cameraId: camera.id,
        ttlSeconds: 600, maxViewers: 3, domains: ['a.com'],
        allowNoReferer: false, rateLimit: 50,
      },
    });

    const service = await makeService();
    const resolved = await service.resolve(camera.id);

    expect(resolved.sources).toEqual({
      ttlSeconds: 'CAMERA',
      maxViewers: 'CAMERA',
      domains: 'CAMERA',
      allowNoReferer: 'CAMERA',
      rateLimit: 'CAMERA',
    });
    expect(resolved.ttlSeconds).toBe(600);
  });

  it('B: partial CAMERA override -> ttlSeconds=CAMERA, others inherit next priority', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera, site, project } = await createCameraHierarchy(testPrisma, org.id);

    await testPrisma.policy.create({
      data: {
        level: 'SYSTEM', name: 'System Default', orgId: null,
        ttlSeconds: 7200, maxViewers: 10, domains: [],
        allowNoReferer: true, rateLimit: 100,
      },
    });
    // PROJECT supplies rateLimit, allowNoReferer
    await testPrisma.policy.create({
      data: {
        level: 'PROJECT', name: 'Proj', orgId: org.id, projectId: project.id,
        rateLimit: 80, allowNoReferer: false,
      },
    });
    // SITE supplies maxViewers
    await testPrisma.policy.create({
      data: {
        level: 'SITE', name: 'Site', orgId: org.id, siteId: site.id,
        maxViewers: 25,
      },
    });
    // CAMERA only sets ttlSeconds
    await testPrisma.policy.create({
      data: {
        level: 'CAMERA', name: 'Cam', orgId: org.id, cameraId: camera.id,
        ttlSeconds: 900,
      },
    });

    const service = await makeService();
    const resolved = await service.resolve(camera.id);

    expect(resolved.sources.ttlSeconds).toBe('CAMERA');
    expect(resolved.sources.maxViewers).toBe('SITE');
    expect(resolved.sources.rateLimit).toBe('PROJECT');
    expect(resolved.sources.allowNoReferer).toBe('PROJECT');
    // domains: all four policies have default [] -> highest-priority wins = CAMERA
    expect(resolved.sources.domains).toBe('CAMERA');

    expect(resolved.ttlSeconds).toBe(900);
    expect(resolved.maxViewers).toBe(25);
    expect(resolved.rateLimit).toBe(80);
    expect(resolved.allowNoReferer).toBe(false);
  });

  it('C: only SYSTEM policy exists -> every source is SYSTEM', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    await testPrisma.policy.create({
      data: {
        level: 'SYSTEM', name: 'System Default', orgId: null,
        ttlSeconds: 7200, maxViewers: 10, domains: ['*'],
        allowNoReferer: true, rateLimit: 100,
      },
    });

    const service = await makeService();
    const resolved = await service.resolve(camera.id);

    expect(resolved.sources).toEqual({
      ttlSeconds: 'SYSTEM',
      maxViewers: 'SYSTEM',
      domains: 'SYSTEM',
      allowNoReferer: 'SYSTEM',
      rateLimit: 'SYSTEM',
    });
  });

  it('D: domains source tracks the highest-priority policy (SITE wins over SYSTEM)', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera, site } = await createCameraHierarchy(testPrisma, org.id);

    await testPrisma.policy.create({
      data: {
        level: 'SYSTEM', name: 'System Default', orgId: null,
        ttlSeconds: 7200, maxViewers: 10, domains: [],
        allowNoReferer: true, rateLimit: 100,
      },
    });
    await testPrisma.policy.create({
      data: {
        level: 'SITE', name: 'Site', orgId: org.id, siteId: site.id,
        domains: ['*.example.com'],
      },
    });

    const service = await makeService();
    const resolved = await service.resolve(camera.id);

    expect(resolved.domains).toEqual(['*.example.com']);
    expect(resolved.sources.domains).toBe('SITE');
  });

  it('E: no policies at all -> fallback defaults with every source = SYSTEM', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    const service = await makeService();
    const resolved = await service.resolve(camera.id);

    expect(resolved.sources).toEqual({
      ttlSeconds: 'SYSTEM',
      maxViewers: 'SYSTEM',
      domains: 'SYSTEM',
      allowNoReferer: 'SYSTEM',
      rateLimit: 'SYSTEM',
    });
  });
});

/**
 * Policy resolution logic (to be implemented in PoliciesService).
 * This is the inline version for testing -- will be replaced by actual service method.
 */
async function resolvePolicy(prisma: typeof testPrisma, cameraId: string) {
  // Get camera with site and project info
  const camera = await prisma.camera.findUniqueOrThrow({
    where: { id: cameraId },
    include: { site: { include: { project: true } } },
  });

  // Fetch policies at all 4 levels
  const policies = await prisma.policy.findMany({
    where: {
      OR: [
        { level: 'CAMERA', cameraId: camera.id },
        { level: 'SITE', siteId: camera.siteId },
        { level: 'PROJECT', projectId: camera.site.projectId },
        { level: 'SYSTEM' },
      ],
    },
  });

  // Priority: CAMERA=0, SITE=1, PROJECT=2, SYSTEM=3
  const priorityMap: Record<string, number> = {
    CAMERA: 0,
    SITE: 1,
    PROJECT: 2,
    SYSTEM: 3,
  };

  policies.sort((a, b) => priorityMap[a.level] - priorityMap[b.level]);

  // Per-field merge: take first non-null/non-undefined value
  const fields = ['ttlSeconds', 'maxViewers', 'allowNoReferer', 'rateLimit'] as const;

  const resolved: Record<string, any> = {
    ttlSeconds: 7200,
    maxViewers: 10,
    domains: [],
    allowNoReferer: true,
    rateLimit: 100,
  };

  for (const field of fields) {
    for (const policy of policies) {
      const value = (policy as any)[field];
      if (value !== null && value !== undefined) {
        resolved[field] = value;
        break;
      }
    }
  }

  // Domains uses array -- handled separately since empty array is a valid value
  // We check if any policy in priority order has domains set (even empty)
  // The Prisma default is [] so we need a convention: domains field always has a value
  // For resolution: the highest-priority policy's domains wins
  for (const policy of policies) {
    // If this policy explicitly has domains set (any array value), use it
    // Since domains always has a default of [], we consider it "set" for CAMERA/SITE/PROJECT levels
    // For SYSTEM level, it's the fallback
    if (policy.level !== 'SYSTEM' || policies.length === 1) {
      resolved.domains = (policy as any).domains;
      break;
    }
    // For system, only use if no higher-priority policy exists
    if (policy.level === 'SYSTEM') {
      resolved.domains = (policy as any).domains;
    }
  }

  return resolved;
}
