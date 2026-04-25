import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamsService } from '../../src/streams/streams.service';

/**
 * Phase 21.1 D-12 — pin Plan 01's enqueueProfileRestart publisher branch.
 *
 * The defect this test guards against (BKR06 + 11-PATCH per
 * 21-VALIDATION.md "DEFECT — Active-job collision"):
 *   - When BullMQ has an active+locked 'start' job for the camera, the
 *     pre-21.1 remove-then-add silently no-op'd because `existingJob.remove()`
 *     threw (caught), then `queue.add` dedup'd by jobId and returned the
 *     existing locked job.
 *   - 11 PATCHes wrote 11 audit rows but FFmpeg PID never changed.
 *
 * The Plan 01 fix branches on `existingJob.isActive()`. This file proves:
 *   1. active branch publishes to camera:{id}:restart and skips queue.add
 *   2. payload contains profile + inputUrl + needsTranscode + fingerprint
 *   3. queued/wait branch (isActive=false) calls remove → add (regression)
 *   4. no-existing-job branch calls add directly (regression)
 *   5. audit-at-enqueue ordering preserved — auditService.log fires BEFORE
 *      redis.publish (D-07 invariant)
 */

describe('Phase 21.1 — D-12 enqueueProfileRestart pub/sub branch on active+locked job', () => {
  let queue: any;
  let prisma: any;
  let redis: any;
  let audit: any;
  let streamsService: StreamsService;

  beforeEach(() => {
    queue = {
      getJob: vi.fn(),
      add: vi.fn().mockResolvedValue({ id: 'j1' }),
    };
    prisma = {
      camera: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'cam-A',
            orgId: 'org-1',
            name: 'A',
            streamUrl: 'rtsp://a',
            streamKey: null,
            ingestMode: 'pull',
            needsTranscode: false,
          },
        ]),
      },
      streamProfile: {
        findUnique: vi.fn().mockResolvedValue({
          codec: 'libx264',
          preset: 'veryfast',
          resolution: '1920x1080',
          fps: 30,
          videoBitrate: '2500k',
          audioCodec: 'aac',
          audioBitrate: '128k',
        }),
      },
    };
    redis = { publish: vi.fn().mockResolvedValue(1) };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    const ffmpeg: any = { isRunning: vi.fn().mockReturnValue(false) };
    const status: any = { transition: vi.fn().mockResolvedValue(undefined) };
    streamsService = new StreamsService(
      prisma,
      queue,
      ffmpeg,
      status,
      undefined /* systemPrisma */,
      audit,
      redis,
    );
  });

  it('active+locked branch: publishes to camera:cam-A:restart and does NOT call queue.add', async () => {
    queue.getJob.mockResolvedValue({
      isActive: vi.fn().mockResolvedValue(true),
      remove: vi.fn(),
    });

    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/x',
      originMethod: 'PATCH',
    });

    expect(redis.publish).toHaveBeenCalledTimes(1);
    expect(redis.publish).toHaveBeenCalledWith('camera:cam-A:restart', expect.any(String));
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('active+locked branch: existingJob.remove() is NOT called (defect-was: remove threw on locked job)', async () => {
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({
      isActive: vi.fn().mockResolvedValue(true),
      remove: removeSpy,
    });

    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/x',
      originMethod: 'PATCH',
    });

    expect(removeSpy).not.toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalledTimes(1);
  });

  it('active+locked branch: payload contains profile, inputUrl, needsTranscode, fingerprint', async () => {
    queue.getJob.mockResolvedValue({
      isActive: vi.fn().mockResolvedValue(true),
      remove: vi.fn(),
    });

    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:abc123',
      triggeredBy: { system: true },
      originPath: '/x',
      originMethod: 'PATCH',
    });

    const [channel, payloadJson] = redis.publish.mock.calls[0];
    expect(channel).toBe('camera:cam-A:restart');
    const payload = JSON.parse(payloadJson);
    expect(payload).toHaveProperty('profile');
    expect(payload).toHaveProperty('inputUrl');
    expect(payload).toHaveProperty('needsTranscode');
    expect(payload).toHaveProperty('fingerprint');
    expect(payload.profile.videoBitrate).toBe('2500k');
    expect(payload.profile.codec).toBe('libx264');
    expect(payload.inputUrl).toBe('rtsp://a');
    expect(payload.needsTranscode).toBe(false);
    expect(payload.fingerprint).toBe('sha256:abc123');
  });

  it('queued-state branch (isActive=false): skips publish, falls through to remove-then-add', async () => {
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({
      isActive: vi.fn().mockResolvedValue(false),
      remove: removeSpy,
    });

    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/x',
      originMethod: 'PATCH',
    });

    expect(redis.publish).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
    // remove fires before add (regression on D-03/Q5 latest-save-wins ordering)
    expect(removeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0],
    );
  });

  it('no-existing-job branch: skips publish, calls queue.add directly', async () => {
    queue.getJob.mockResolvedValue(null);

    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/x',
      originMethod: 'PATCH',
    });

    expect(redis.publish).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
    // jobId pattern preserved (camera:{id}:ffmpeg)
    const opts = queue.add.mock.calls[0][2];
    expect(opts.jobId).toBe('camera:cam-A:ffmpeg');
  });

  it('audit-ordering preserved: auditService.log fires BEFORE redis.publish (D-07 invariant)', async () => {
    queue.getJob.mockResolvedValue({
      isActive: vi.fn().mockResolvedValue(true),
      remove: vi.fn(),
    });

    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/x',
      originMethod: 'PATCH',
    });

    expect(audit.log).toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalled();
    expect(audit.log.mock.invocationCallOrder[0]).toBeLessThan(
      redis.publish.mock.invocationCallOrder[0],
    );
  });

  it('audit row written even on active branch (D-07 — audit row exists regardless of restart path)', async () => {
    queue.getJob.mockResolvedValue({
      isActive: vi.fn().mockResolvedValue(true),
      remove: vi.fn(),
    });

    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/api/stream-profiles/p1',
      originMethod: 'PATCH',
    });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'camera.profile_hot_reload',
        resource: 'camera',
        resourceId: 'cam-A',
        method: 'PATCH',
        path: '/api/stream-profiles/p1',
      }),
    );
  });
});
