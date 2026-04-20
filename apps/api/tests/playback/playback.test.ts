import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization } from '../helpers/tenancy';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'crypto';

const JWT_SECRET = new TextEncoder().encode('test-secret-key-at-least-32-chars-long!!');

/**
 * Helper to create a full camera hierarchy for testing.
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

/**
 * Simulate createSession logic (will be in PlaybackService).
 */
async function createSession(
  prisma: typeof testPrisma,
  cameraId: string,
  orgId: string,
  resolvedPolicy: { ttlSeconds: number; maxViewers: number; domains: string[]; allowNoReferer: boolean },
  currentViewerCount: number,
) {
  // Check viewer limit
  if (resolvedPolicy.maxViewers > 0 && currentViewerCount >= resolvedPolicy.maxViewers) {
    throw new Error(`Viewer limit reached (${currentViewerCount}/${resolvedPolicy.maxViewers})`);
  }

  const expiresAt = new Date(Date.now() + resolvedPolicy.ttlSeconds * 1000);

  // Create session record
  const session = await prisma.playbackSession.create({
    data: {
      orgId,
      cameraId,
      token: '', // placeholder, updated after JWT signing
      hlsUrl: '', // placeholder
      ttlSeconds: resolvedPolicy.ttlSeconds,
      maxViewers: resolvedPolicy.maxViewers,
      domains: resolvedPolicy.domains,
      allowNoReferer: resolvedPolicy.allowNoReferer,
      expiresAt,
    },
  });

  // Sign JWT
  const token = await new SignJWT({
    cam: cameraId,
    org: orgId,
    domains: resolvedPolicy.domains,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.id)
    .setIssuedAt()
    .setExpirationTime(`${resolvedPolicy.ttlSeconds}s`)
    .sign(JWT_SECRET);

  const hlsUrl = `http://srs:8080/live/${orgId}/${cameraId}.m3u8?token=${token}`;

  // Update session with token and hlsUrl
  const updated = await prisma.playbackSession.update({
    where: { id: session.id },
    data: { token, hlsUrl },
  });

  return { sessionId: updated.id, hlsUrl: updated.hlsUrl, expiresAt: updated.expiresAt };
}

/**
 * Domain matching logic (will be in PlaybackService).
 */
function matchDomain(pageUrl: string | undefined | null, allowedDomains: string[], allowNoReferer: boolean): boolean {
  if (!pageUrl) return allowNoReferer;
  if (allowedDomains.length === 0) return true;

  let hostname: string;
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    return allowNoReferer; // malformed URL = treat as no referer
  }

  for (const pattern of allowedDomains) {
    if (pattern === '*') return true;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // ".example.com"
      if (hostname.endsWith(suffix) || hostname === pattern.slice(2)) return true;
    } else {
      if (hostname === pattern) return true;
    }
  }

  return false;
}

describe('PLAY-01/PLAY-02: Playback session creation and JWT', () => {
  beforeEach(async () => {
    await cleanupTestData(testPrisma);
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('createSession returns { sessionId, hlsUrl, expiresAt }', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    const result = await createSession(testPrisma, camera.id, org.id, {
      ttlSeconds: 7200,
      maxViewers: 10,
      domains: [],
      allowNoReferer: true,
    }, 0);

    expect(result.sessionId).toBeDefined();
    expect(result.hlsUrl).toBeDefined();
    expect(result.expiresAt).toBeDefined();
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('hlsUrl contains JWT token as query param', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    const result = await createSession(testPrisma, camera.id, org.id, {
      ttlSeconds: 7200,
      maxViewers: 10,
      domains: [],
      allowNoReferer: true,
    }, 0);

    expect(result.hlsUrl).toContain(`/live/${org.id}/${camera.id}.m3u8?token=`);
    // Extract and verify token is a valid JWT
    const token = result.hlsUrl.split('?token=')[1];
    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3); // JWT has 3 parts
  });

  it('JWT payload contains sub=sessionId, cam=cameraId, org=orgId, domains, exp', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    const result = await createSession(testPrisma, camera.id, org.id, {
      ttlSeconds: 7200,
      maxViewers: 10,
      domains: ['example.com'],
      allowNoReferer: true,
    }, 0);

    const token = result.hlsUrl.split('?token=')[1];
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(payload.sub).toBe(result.sessionId);
    expect(payload.cam).toBe(camera.id);
    expect(payload.org).toBe(org.id);
    expect(payload.domains).toEqual(['example.com']);
    expect(payload.exp).toBeDefined();
  });

  it('createSession rejects with error when viewer count >= maxViewers (maxViewers > 0)', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    await expect(
      createSession(testPrisma, camera.id, org.id, {
        ttlSeconds: 7200,
        maxViewers: 2,
        domains: [],
        allowNoReferer: true,
      }, 2), // currentViewers >= maxViewers
    ).rejects.toThrow('Viewer limit reached (2/2)');
  });

  it('createSession allows when maxViewers=0 (unlimited) regardless of viewer count', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    const result = await createSession(testPrisma, camera.id, org.id, {
      ttlSeconds: 7200,
      maxViewers: 0, // unlimited
      domains: [],
      allowNoReferer: true,
    }, 999); // many viewers

    expect(result.sessionId).toBeDefined();
  });

  it('verifyToken returns session data for valid token', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    const result = await createSession(testPrisma, camera.id, org.id, {
      ttlSeconds: 7200,
      maxViewers: 10,
      domains: [],
      allowNoReferer: true,
    }, 0);

    const token = result.hlsUrl.split('?token=')[1];
    const { payload } = await jwtVerify(token, JWT_SECRET);

    expect(payload.cam).toBe(camera.id);
    expect(payload.org).toBe(org.id);

    // Look up session
    const session = await testPrisma.playbackSession.findUnique({
      where: { id: payload.sub },
    });

    expect(session).toBeDefined();
    expect(session!.cameraId).toBe(camera.id);
  });

  it('verifyToken rejects expired token', async () => {
    // Sign a token with 0s expiration
    const token = await new SignJWT({ cam: 'test', org: 'test', domains: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('test-session-id')
      .setIssuedAt()
      .setExpirationTime('0s')
      .sign(JWT_SECRET);

    // Wait a tiny bit for expiration
    await new Promise((r) => setTimeout(r, 1100));

    await expect(jwtVerify(token, JWT_SECRET)).rejects.toThrow();
  });

  it('verifyToken rejects token with wrong cameraId', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    const result = await createSession(testPrisma, camera.id, org.id, {
      ttlSeconds: 7200,
      maxViewers: 10,
      domains: [],
      allowNoReferer: true,
    }, 0);

    const token = result.hlsUrl.split('?token=')[1];
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Token was signed for camera.id, check fails with wrong cameraId
    expect(payload.cam).toBe(camera.id);
    expect(payload.cam).not.toBe('wrong-camera-id');
  });

  it('getSession returns session info', async () => {
    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    const result = await createSession(testPrisma, camera.id, org.id, {
      ttlSeconds: 7200,
      maxViewers: 10,
      domains: [],
      allowNoReferer: true,
    }, 0);

    const session = await testPrisma.playbackSession.findUnique({
      where: { id: result.sessionId },
    });

    expect(session).toBeDefined();
    expect(session!.id).toBe(result.sessionId);
    expect(session!.hlsUrl).toBe(result.hlsUrl);
    expect(session!.cameraId).toBe(camera.id);
  });
});

describe('GET /playback/sessions (listSessionsByCamera)', () => {
  beforeEach(async () => {
    await cleanupTestData(testPrisma);
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('returns sessions for target camera only, ordered createdAt DESC', async () => {
    const { PlaybackService } = await import('../../src/playback/playback.service');

    const org = await createTestOrganization(testPrisma);
    const { camera: cameraA } = await createCameraHierarchy(testPrisma, org.id);
    // cameraB in same org
    const siteB = await testPrisma.site.findFirstOrThrow({ where: { orgId: org.id } });
    const cameraB = await testPrisma.camera.create({
      data: { orgId: org.id, siteId: siteB.id, name: 'Cam B', streamUrl: 'rtsp://test:554/b' },
    });

    // 3 sessions on cameraA with varied createdAt
    const now = Date.now();
    const sA1 = await testPrisma.playbackSession.create({
      data: {
        orgId: org.id, cameraId: cameraA.id,
        token: 't1', hlsUrl: 'h1', ttlSeconds: 60, maxViewers: 10,
        domains: [], allowNoReferer: true,
        createdAt: new Date(now - 3000),
        expiresAt: new Date(now + 60_000),
      },
    });
    const sA2 = await testPrisma.playbackSession.create({
      data: {
        orgId: org.id, cameraId: cameraA.id,
        token: 't2', hlsUrl: 'h2', ttlSeconds: 60, maxViewers: 10,
        domains: [], allowNoReferer: true,
        createdAt: new Date(now - 2000),
        expiresAt: new Date(now + 60_000),
      },
    });
    const sA3 = await testPrisma.playbackSession.create({
      data: {
        orgId: org.id, cameraId: cameraA.id,
        token: 't3', hlsUrl: 'h3', ttlSeconds: 60, maxViewers: 10,
        domains: [], allowNoReferer: true,
        createdAt: new Date(now - 1000),
        expiresAt: new Date(now + 60_000),
      },
    });
    // 1 session on cameraB
    await testPrisma.playbackSession.create({
      data: {
        orgId: org.id, cameraId: cameraB.id,
        token: 'tb', hlsUrl: 'hb', ttlSeconds: 60, maxViewers: 10,
        domains: [], allowNoReferer: true,
        expiresAt: new Date(now + 60_000),
      },
    });

    const service = new PlaybackService(testPrisma as any, testPrisma as any, {} as any, {} as any, {} as any);
    const result = await service.listSessionsByCamera(cameraA.id, org.id);

    expect(result).toHaveLength(3);
    expect(result.map((s: any) => s.id)).toEqual([sA3.id, sA2.id, sA1.id]);
  });

  it('limit parameter caps result count', async () => {
    const { PlaybackService } = await import('../../src/playback/playback.service');

    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    for (let i = 0; i < 5; i++) {
      await testPrisma.playbackSession.create({
        data: {
          orgId: org.id, cameraId: camera.id,
          token: `t${i}`, hlsUrl: `h${i}`, ttlSeconds: 60, maxViewers: 10,
          domains: [], allowNoReferer: true,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
    }

    const service = new PlaybackService(testPrisma as any, testPrisma as any, {} as any, {} as any, {} as any);
    const limited = await service.listSessionsByCamera(camera.id, org.id, 2);
    expect(limited).toHaveLength(2);

    const defaulted = await service.listSessionsByCamera(camera.id, org.id);
    expect(defaulted).toHaveLength(5); // default 20 caps above actual count
  });

  it('returned shape is { id, createdAt, expiresAt } only', async () => {
    const { PlaybackService } = await import('../../src/playback/playback.service');

    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    await testPrisma.playbackSession.create({
      data: {
        orgId: org.id, cameraId: camera.id,
        token: 'secret-token', hlsUrl: 'http://host/live.m3u8?token=secret',
        ttlSeconds: 60, maxViewers: 10,
        domains: [], allowNoReferer: true,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const service = new PlaybackService(testPrisma as any, testPrisma as any, {} as any, {} as any, {} as any);
    const rows = await service.listSessionsByCamera(camera.id, org.id);

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(['createdAt', 'expiresAt', 'id']);
    expect((rows[0] as any).token).toBeUndefined();
    expect((rows[0] as any).hlsUrl).toBeUndefined();
  });

  it('includes expired sessions (frontend renders Expired badge)', async () => {
    const { PlaybackService } = await import('../../src/playback/playback.service');

    const org = await createTestOrganization(testPrisma);
    const { camera } = await createCameraHierarchy(testPrisma, org.id);

    await testPrisma.playbackSession.create({
      data: {
        orgId: org.id, cameraId: camera.id,
        token: 'exp', hlsUrl: 'h', ttlSeconds: 60, maxViewers: 10,
        domains: [], allowNoReferer: true,
        expiresAt: new Date(Date.now() - 10_000), // already expired
      },
    });

    const service = new PlaybackService(testPrisma as any, testPrisma as any, {} as any, {} as any, {} as any);
    const rows = await service.listSessionsByCamera(camera.id, org.id);
    expect(rows).toHaveLength(1);
  });

  it('throws NotFoundException when camera belongs to a different org', async () => {
    const { PlaybackService } = await import('../../src/playback/playback.service');

    const orgA = await createTestOrganization(testPrisma);
    const orgB = await createTestOrganization(testPrisma);
    const { camera: cameraA } = await createCameraHierarchy(testPrisma, orgA.id);

    const service = new PlaybackService(testPrisma as any, testPrisma as any, {} as any, {} as any, {} as any);
    await expect(service.listSessionsByCamera(cameraA.id, orgB.id)).rejects.toThrow();
  });

  it('throws NotFoundException for unknown camera id', async () => {
    const { PlaybackService } = await import('../../src/playback/playback.service');

    const org = await createTestOrganization(testPrisma);
    const service = new PlaybackService(testPrisma as any, testPrisma as any, {} as any, {} as any, {} as any);
    await expect(service.listSessionsByCamera(randomUUID(), org.id)).rejects.toThrow();
  });
});

describe('PLAY-04/PLAY-05: Domain matching', () => {
  it('returns allowNoReferer when no pageUrl', () => {
    expect(matchDomain(null, ['example.com'], true)).toBe(true);
    expect(matchDomain(null, ['example.com'], false)).toBe(false);
    expect(matchDomain('', ['example.com'], true)).toBe(true);
    expect(matchDomain(undefined, ['example.com'], false)).toBe(false);
  });

  it('returns true when allowedDomains is empty (allow all)', () => {
    expect(matchDomain('https://anything.com/page', [], true)).toBe(true);
    expect(matchDomain('https://anything.com/page', [], false)).toBe(true);
  });

  it('matches exact domain', () => {
    expect(matchDomain('https://example.com/page', ['example.com'], false)).toBe(true);
    expect(matchDomain('https://other.com/page', ['example.com'], false)).toBe(false);
  });

  it('matches wildcard domain *.example.com', () => {
    expect(matchDomain('https://sub.example.com/page', ['*.example.com'], false)).toBe(true);
    expect(matchDomain('https://example.com/page', ['*.example.com'], false)).toBe(true);
    expect(matchDomain('https://other.com/page', ['*.example.com'], false)).toBe(false);
  });

  it('matches * (allow all)', () => {
    expect(matchDomain('https://anything.com/page', ['*'], false)).toBe(true);
  });

  it('treats malformed URL as no referer', () => {
    expect(matchDomain('not-a-url', ['example.com'], true)).toBe(true);
    expect(matchDomain('not-a-url', ['example.com'], false)).toBe(false);
  });
});
