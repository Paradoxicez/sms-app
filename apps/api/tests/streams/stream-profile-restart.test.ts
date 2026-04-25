import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamsService } from '../../src/streams/streams.service';
import { StreamProfileService } from '../../src/streams/stream-profile.service';

// ─────────────────────────────────────────────────────────────────────────────
// Test harness — manual DI of StreamsService + StreamProfileService with
// mocked Prisma + mocked BullMQ queue. Mirrors stream-processor.test.ts shape.
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
    isRecording?: boolean;
    streamUrl?: string;
    streamKey?: string;
    ingestMode?: string;
    needsTranscode?: boolean;
  }>;
  preProfile?: any;
  postProfile?: any;
}) {
  const pre = opts.preProfile ?? baseProfile;
  const post = opts.postProfile ?? baseProfile;
  // Ordered list of recorded calls so tests can assert audit-then-enqueue order.
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
    isRecording: false,
    maintenanceMode: false,
    ...c,
  }));

  // Cameras matching the where clause (the service does the filtering through
  // findMany's `where`, but the mock just returns whatever the test passes —
  // so tests pre-filter or the service code's where clause is effectively a no-op
  // here). To preserve the actual filtering contract, the mock honors the
  // status + maintenanceMode predicate.
  const findMany = vi.fn().mockImplementation(({ where }: any) => {
    let filtered = cameras;
    if (where?.streamProfileId) {
      // tests use a single profile; ignore filter on profileId since fixture is local
    }
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
      // First call by StreamProfileService.update reads pre-image, then
      // StreamsService.enqueueProfileRestart reads to build job.data.profile.
      // Sequence: streamProfileFindUnique returns `pre` first, then `post`.
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

  // FfmpegService + StatusService not exercised by enqueueProfileRestart;
  // only the constructor needs them to satisfy NestJS-free manual instantiation.
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

  return { streamsService, profileService, queue, auditService, callOrder, prisma };
}

describe('Phase 21 — D-01 StreamProfileService.update restart trigger + D-04 jitter + maintenance-gate + status-filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('StreamProfileService.update with no FFmpeg-affecting field changes does NOT enqueue any restart job', async () => {
    // pre and post are structurally identical → fingerprints match → no fan-out.
    const h = buildHarness({
      cameras: [{ id: 'c1', status: 'online', maintenanceMode: false }],
      preProfile: baseProfile,
      postProfile: { ...baseProfile, name: 'Renamed' }, // name does not affect fingerprint
    });
    const result = await h.profileService.update('p1', { name: 'Renamed' } as any);
    expect(h.queue.add).not.toHaveBeenCalled();
    expect(result.affectedCameras).toBe(0);
  });

  it('StreamProfileService.update with codec change enqueues a restart job per affected camera', async () => {
    const h = buildHarness({
      cameras: [
        { id: 'c1', status: 'online', maintenanceMode: false },
        { id: 'c2', status: 'connecting', maintenanceMode: false },
      ],
      preProfile: baseProfile,
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    const result = await h.profileService.update('p1', { codec: 'copy' } as any);
    expect(h.queue.add).toHaveBeenCalledTimes(2);
    expect(result.affectedCameras).toBe(2);
  });

  it('StreamProfileService.update with name-only change enqueues NO restart job', async () => {
    const h = buildHarness({
      cameras: [{ id: 'c1', status: 'online', maintenanceMode: false }],
      preProfile: baseProfile,
      postProfile: { ...baseProfile, name: 'Brand new name' },
    });
    const result = await h.profileService.update('p1', { name: 'Brand new name' } as any);
    expect(h.queue.add).not.toHaveBeenCalled();
    expect(result.affectedCameras).toBe(0);
  });

  it('StreamProfileService.update with description-only change enqueues NO restart job', async () => {
    const h = buildHarness({
      cameras: [{ id: 'c1', status: 'online', maintenanceMode: false }],
      preProfile: { ...baseProfile, description: 'old' } as any,
      postProfile: { ...baseProfile, description: 'new' } as any,
    });
    const result = await h.profileService.update('p1', { description: 'new' } as any);
    expect(h.queue.add).not.toHaveBeenCalled();
    expect(result.affectedCameras).toBe(0);
  });

  it('Only cameras with status in {online, connecting, reconnecting, degraded} get enqueued — offline cameras are skipped', async () => {
    const h = buildHarness({
      cameras: [
        { id: 'on1', status: 'online' },
        { id: 'cn1', status: 'connecting' },
        { id: 'rc1', status: 'reconnecting' },
        { id: 'dg1', status: 'degraded' },
        { id: 'off1', status: 'offline' },
        { id: 'err1', status: 'error' as any },
      ],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any);
    expect(h.queue.add).toHaveBeenCalledTimes(4);
    const enqueuedIds = h.queue.add.mock.calls.map((args: any[]) => args[1].cameraId);
    expect(enqueuedIds).toEqual(expect.arrayContaining(['on1', 'cn1', 'rc1', 'dg1']));
    expect(enqueuedIds).not.toContain('off1');
    expect(enqueuedIds).not.toContain('err1');
  });

  it('Cameras with maintenanceMode=true are skipped at enqueue time even if status matches', async () => {
    const h = buildHarness({
      cameras: [
        { id: 'live', status: 'online', maintenanceMode: false },
        { id: 'maint', status: 'online', maintenanceMode: true },
      ],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any);
    expect(h.queue.add).toHaveBeenCalledTimes(1);
    expect(h.queue.add.mock.calls[0][1].cameraId).toBe('live');
  });

  it('Each enqueued job carries a delay in [0, 30000) ms (D-04 jitter)', async () => {
    const h = buildHarness({
      cameras: [
        { id: 'c1', status: 'online' },
        { id: 'c2', status: 'online' },
        { id: 'c3', status: 'online' },
      ],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any);
    for (const call of h.queue.add.mock.calls) {
      const opts = call[2];
      expect(opts.delay).toBeTypeOf('number');
      expect(opts.delay).toBeGreaterThanOrEqual(0);
      expect(opts.delay).toBeLessThan(30_000);
    }
  });

  it('100 enqueues over a synthetic camera set produce delay distribution within [0, 30000) for ALL of them', async () => {
    const cameras = Array.from({ length: 100 }, (_, i) => ({
      id: `c${i}`,
      status: 'online',
    }));
    const h = buildHarness({
      cameras,
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any);
    expect(h.queue.add).toHaveBeenCalledTimes(100);
    for (const call of h.queue.add.mock.calls) {
      const delay = call[2].delay;
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(30_000);
    }
  });

  it('D-08: cameras with isRecording=true are NOT special-cased — they enqueue normally with no extra branch', async () => {
    const h = buildHarness({
      cameras: [
        { id: 'rec', status: 'online', isRecording: true },
        { id: 'noRec', status: 'online', isRecording: false },
      ],
      postProfile: { ...baseProfile, codec: 'copy' },
    });
    await h.profileService.update('p1', { codec: 'copy' } as any);
    expect(h.queue.add).toHaveBeenCalledTimes(2);
    // Both calls produced identical job options shape — no recording branch.
    const allOpts = h.queue.add.mock.calls.map((c: any[]) => Object.keys(c[2]).sort());
    expect(allOpts[0]).toEqual(allOpts[1]);
  });
});
