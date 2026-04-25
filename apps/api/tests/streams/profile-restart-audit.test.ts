import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamsService } from '../../src/streams/streams.service';
import { StreamProfileService } from '../../src/streams/stream-profile.service';

// ─────────────────────────────────────────────────────────────────────────────
// D-07 audit-row tests — focus on call ordering, payload shape, triggeredBy
// variants. Builds the same harness shape used in stream-profile-restart.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const baseProfile = {
  id: 'p1',
  orgId: 'orgA',
  name: 'Default',
  codec: 'libx264',
  preset: 'veryfast',
  resolution: '1920x1080',
  fps: 30,
  videoBitrate: '2000k',
  audioCodec: 'aac',
  audioBitrate: '128k',
  isDefault: true,
};

function buildHarness(opts: {
  cameras: Array<{
    id: string;
    orgId?: string;
    status: string;
    maintenanceMode?: boolean;
  }>;
  preProfile?: any;
  postProfile?: any;
}) {
  const pre = opts.preProfile ?? baseProfile;
  const post = opts.postProfile ?? baseProfile;
  const callOrder: string[] = [];

  const queue = {
    getJob: vi.fn().mockResolvedValue(null),
    add: vi.fn().mockImplementation((..._args: any[]) => {
      callOrder.push('queue.add');
      return Promise.resolve({});
    }),
  };

  const auditService = {
    log: vi.fn().mockImplementation((..._args: any[]) => {
      callOrder.push('audit.log');
      return Promise.resolve();
    }),
  };

  const cameras = opts.cameras.map((c) => ({
    orgId: 'orgA',
    streamUrl: 'rtsp://cam/1',
    streamKey: null,
    ingestMode: 'pull',
    needsTranscode: true,
    name: c.id,
    maintenanceMode: false,
    ...c,
  }));

  const findMany = vi.fn().mockImplementation(({ where }: any) => {
    let filtered = cameras;
    if (where?.status?.in) {
      filtered = filtered.filter((c) => where.status.in.includes(c.status));
    }
    if (where?.maintenanceMode === false) {
      filtered = filtered.filter((c) => c.maintenanceMode === false);
    }
    return Promise.resolve(filtered);
  });

  const streamProfileFindUnique = vi.fn().mockImplementation(({ where }: any) => {
    if (where?.id === pre.id) {
      const callIndex = streamProfileFindUnique.mock.calls.length;
      return Promise.resolve(callIndex === 1 ? pre : post);
    }
    return Promise.resolve(null);
  });

  const streamProfileUpdate = vi.fn().mockResolvedValue(post);
  const streamProfileUpdateMany = vi.fn().mockResolvedValue({ count: 0 });

  const prisma = {
    camera: { findMany },
    streamProfile: {
      findUnique: streamProfileFindUnique,
      update: streamProfileUpdate,
      updateMany: streamProfileUpdateMany,
    },
  };

  const ffmpegService = { isRunning: vi.fn(), stopStream: vi.fn() } as any;
  const statusService = { transition: vi.fn() } as any;

  const streamsService = new StreamsService(
    prisma as any,
    queue as any,
    ffmpegService,
    statusService,
    undefined,
    auditService as any,
  );

  const profileService = new StreamProfileService(prisma as any, streamsService);

  return { streamsService, profileService, queue, auditService, callOrder };
}

describe('Phase 21 — D-07 audit row at enqueue time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Each affected camera gets exactly one audit row with action='camera.profile_hot_reload'", async () => {
    const h = buildHarness({
      cameras: [
        { id: 'c1', status: 'online' },
        { id: 'c2', status: 'online' },
      ],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any);
    expect(h.auditService.log).toHaveBeenCalledTimes(2);
    for (const call of h.auditService.log.mock.calls) {
      expect(call[0].action).toBe('camera.profile_hot_reload');
    }
  });

  it("Audit row resource='camera' and resourceId equals cameraId (not profileId)", async () => {
    const h = buildHarness({
      cameras: [{ id: 'cam-XYZ', status: 'online' }],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any);
    const payload = h.auditService.log.mock.calls[0][0];
    expect(payload.resource).toBe('camera');
    expect(payload.resourceId).toBe('cam-XYZ');
    expect(payload.resourceId).not.toBe('p1');
  });

  it('Audit row details contains profileId, oldFingerprint (sha256:...), newFingerprint (sha256:...), and triggeredBy', async () => {
    const h = buildHarness({
      cameras: [{ id: 'c1', status: 'online' }],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any, {
      userId: 'u1',
      userEmail: 'admin@example.com',
    });
    const payload = h.auditService.log.mock.calls[0][0];
    expect(payload.details.profileId).toBe('p1');
    expect(payload.details.oldFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(payload.details.newFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(payload.details.oldFingerprint).not.toBe(payload.details.newFingerprint);
    expect(payload.details.triggeredBy).toEqual({ userId: 'u1', userEmail: 'admin@example.com' });
  });

  it('triggeredBy is { userId, userEmail } when req.user is present', async () => {
    const h = buildHarness({
      cameras: [{ id: 'c1', status: 'online' }],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any, {
      userId: 'u-42',
      userEmail: 'op@example.com',
    });
    const payload = h.auditService.log.mock.calls[0][0];
    expect(payload.userId).toBe('u-42');
    expect(payload.details.triggeredBy).toEqual({ userId: 'u-42', userEmail: 'op@example.com' });
  });

  it('triggeredBy is { system: true } when no user context (defensive — script callpath)', async () => {
    const h = buildHarness({
      cameras: [{ id: 'c1', status: 'online' }],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    // Default third arg falls through to { system: true }
    await h.profileService.update('p1', { codec: 'copy' } as any);
    const payload = h.auditService.log.mock.calls[0][0];
    expect(payload.details.triggeredBy).toEqual({ system: true });
    expect(payload.userId).toBeUndefined();
  });

  it('Audit row is written at ENQUEUE time, before queue.add — so even if the job is later removed/superseded the audit persists', async () => {
    const h = buildHarness({
      cameras: [
        { id: 'c1', status: 'online' },
        { id: 'c2', status: 'online' },
      ],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any);
    // For each camera, audit.log must precede queue.add. The harness records
    // a single sequential trace so we expect strict alternation:
    //   audit.log, queue.add, audit.log, queue.add
    expect(h.callOrder).toEqual(['audit.log', 'queue.add', 'audit.log', 'queue.add']);
  });

  it("method='PATCH' and path matches the originating /api/stream-profiles/:id or /api/cameras/:id request URL", async () => {
    const h = buildHarness({
      cameras: [{ id: 'c1', status: 'online' }],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any);
    const payload = h.auditService.log.mock.calls[0][0];
    expect(payload.method).toBe('PATCH');
    expect(payload.path).toBe('/api/stream-profiles/p1');
  });
});
