import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamsService } from '../../src/streams/streams.service';

describe('Phase 21 — D-03 + Q5 remove-then-add (latest save wins, NOT pure BullMQ dedup)', () => {
  let queue: any;
  let prisma: any;
  let streamsService: StreamsService;

  beforeEach(() => {
    queue = {
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockImplementation((_n: string, _d: unknown, opts: any) => {
        return Promise.resolve({ id: opts.jobId });
      }),
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
          videoBitrate: '2000k',
          audioCodec: 'aac',
          audioBitrate: '128k',
        }),
      },
    };
    const ffmpeg: any = { isRunning: vi.fn().mockReturnValue(false) };
    const status: any = { transition: vi.fn().mockResolvedValue(undefined) };
    const audit: any = { log: vi.fn().mockResolvedValue(undefined) };
    streamsService = new StreamsService(
      prisma,
      queue,
      ffmpeg,
      status,
      undefined,
      audit,
    );
  });

  it("enqueue calls queue.getJob('camera:{id}:ffmpeg') to look for existing job before adding", async () => {
    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/api/stream-profiles/p1',
      originMethod: 'PATCH',
    });

    expect(queue.getJob).toHaveBeenCalledWith('camera:cam-A:ffmpeg');
    // Order: getJob fires before add (lookup-first ordering).
    expect(queue.getJob.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0],
    );
  });

  it('when existingJob is present, enqueue calls existingJob.remove() before queue.add', async () => {
    const removeMock = vi.fn().mockResolvedValue(undefined);
    queue.getJob = vi.fn().mockResolvedValueOnce({ remove: removeMock });

    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/api/stream-profiles/p1',
      originMethod: 'PATCH',
    });

    expect(removeMock).toHaveBeenCalled();
    expect(removeMock.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0],
    );
  });

  it('two rapid-fire profile saves for the same camera produce: first remove (no-op, no job) → first add → second remove of first → second add — net 1 job in queue with second-save data', async () => {
    const events: string[] = [];
    let storedJob: any = null;
    queue.getJob = vi.fn().mockImplementation(async () => {
      events.push('getJob');
      return storedJob;
    });
    queue.add = vi
      .fn()
      .mockImplementation(async (_n: string, _d: unknown, opts: any) => {
        events.push('add:' + opts.jobId);
        storedJob = {
          remove: vi.fn(async () => {
            events.push('remove');
            storedJob = null;
          }),
        };
        return { id: opts.jobId };
      });
    streamsService = new StreamsService(
      prisma,
      queue,
      { isRunning: () => false } as any,
      { transition: vi.fn() } as any,
      undefined,
      { log: vi.fn() } as any,
    );

    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'a',
      newFingerprint: 'b',
      triggeredBy: { system: true },
      originPath: '/x',
      originMethod: 'PATCH',
    });
    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'b',
      newFingerprint: 'c',
      triggeredBy: { system: true },
      originPath: '/x',
      originMethod: 'PATCH',
    });

    // Expected order: getJob (no existing), add, getJob (existing), remove, add.
    expect(events).toEqual([
      'getJob',
      'add:camera:cam-A:ffmpeg',
      'getJob',
      'remove',
      'add:camera:cam-A:ffmpeg',
    ]);
  });

  it("jobId is exactly the literal 'camera:' + cameraId + ':ffmpeg' (matches Phase 15 D-11 + streams.service.ts:101 + boot-recovery.service.ts + camera-health.service.ts)", async () => {
    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/api/stream-profiles/p1',
      originMethod: 'PATCH',
    });

    expect(queue.add).toHaveBeenCalledWith(
      'restart',
      expect.objectContaining({ cameraId: 'cam-A' }),
      expect.objectContaining({ jobId: 'camera:cam-A:ffmpeg' }),
    );
  });

  it("queue.add is called with options { jobId, attempts: 20, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: false } — matches startStream's options for downstream consistency", async () => {
    await streamsService.enqueueProfileRestart({
      profileId: 'p1',
      oldFingerprint: 'sha256:old',
      newFingerprint: 'sha256:new',
      triggeredBy: { system: true },
      originPath: '/api/stream-profiles/p1',
      originMethod: 'PATCH',
    });

    expect(queue.add).toHaveBeenCalledWith(
      'restart',
      expect.anything(),
      expect.objectContaining({
        attempts: 20,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
        delay: expect.any(Number),
      }),
    );
    const opts = queue.add.mock.calls[0][2];
    expect(opts.delay).toBeGreaterThanOrEqual(0);
    expect(opts.delay).toBeLessThan(30_000);
  });
});
