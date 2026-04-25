// Quick task 260426-07r — Edge Case A1 (choice 1A) backend semantic
// alignment. When camera.streamProfileId is null, StreamsService.startStream
// MUST resolve the org's isDefault=true profile (via systemPrisma) and
// build the FFmpeg job profile from those settings. Only when NO isDefault
// row exists in the org should the hardcoded {codec:'auto', audioCodec:'aac'}
// safety net fire.
//
// Tests:
//   (a) findFirst returns an isDefault row → jobData.profile carries that
//       row's 7 fields (codec, preset, resolution, fps, videoBitrate,
//       audioCodec, audioBitrate).
//   (b) findFirst returns null → jobData.profile === {codec:'auto',
//       audioCodec:'aac'} (the legacy fallback).
//
// Constructor signature (apps/api/src/streams/streams.service.ts):
//   (prisma, streamQueue, ffmpegService, statusService, systemPrisma?,
//    auditService?, redis?)
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fluent-ffmpeg so FfmpegService import doesn't spawn real processes
// (matches streams-service-push.test.ts pattern).
vi.mock('fluent-ffmpeg', () => ({
  default: vi.fn(() => ({
    inputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    outputFormat: vi.fn().mockReturnThis(),
    videoCodec: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    addOutputOptions: vi.fn().mockReturnThis(),
    videoBitrate: vi.fn().mockReturnThis(),
    size: vi.fn().mockReturnThis(),
    fps: vi.fn().mockReturnThis(),
    audioBitrate: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    run: vi.fn(),
    kill: vi.fn(),
  })),
}));

import { StreamsService } from '../../src/streams/streams.service';

describe('StreamsService.startStream — null streamProfile fallback (quick-260426-07r A1)', () => {
  let mockQueue: any;
  let mockFfmpegService: any;
  let mockStatusService: any;

  const nullProfileCamera = {
    id: 'cam-null',
    orgId: 'orgA',
    name: 'Legacy Null Cam',
    ingestMode: 'pull',
    streamKey: null,
    streamUrl: 'rtsp://cam/1',
    needsTranscode: true,
    streamProfile: null,
    streamProfileId: null,
  };

  function buildService(systemPrismaImpl: any) {
    const mockPrisma: any = {
      camera: {
        findUnique: vi.fn().mockResolvedValue(nullProfileCamera),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const svc = new StreamsService(
      mockPrisma,
      mockQueue,
      mockFfmpegService,
      mockStatusService,
      systemPrismaImpl,
    );
    return { svc, prisma: mockPrisma };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      remove: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn().mockResolvedValue(null),
    };
    mockFfmpegService = {
      stopStream: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    };
    mockStatusService = {
      transition: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('(a) null streamProfile + org has isDefault profile → jobData.profile carries the org-default 7 fields', async () => {
    const orgDefault = {
      id: 'pDef',
      orgId: 'orgA',
      name: 'Org Default 720p',
      isDefault: true,
      codec: 'libx264',
      preset: 'fast',
      resolution: '1280x720',
      fps: 25,
      videoBitrate: '1500k',
      audioCodec: 'aac',
      audioBitrate: '96k',
    };
    const mockSystemPrisma: any = {
      streamProfile: {
        findFirst: vi.fn().mockResolvedValue(orgDefault),
      },
      camera: { findUnique: vi.fn() },
    };

    const { svc } = buildService(mockSystemPrisma);
    await svc.startStream('cam-null');

    expect(mockSystemPrisma.streamProfile.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'orgA', isDefault: true },
    });
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        cameraId: 'cam-null',
        orgId: 'orgA',
        profile: {
          codec: 'libx264',
          preset: 'fast',
          resolution: '1280x720',
          fps: 25,
          videoBitrate: '1500k',
          audioCodec: 'aac',
          audioBitrate: '96k',
        },
      }),
      expect.objectContaining({ jobId: 'camera:cam-null:ffmpeg' }),
    );
  });

  it('(b) null streamProfile + org has NO isDefault profile → jobData.profile === {codec:"auto", audioCodec:"aac"}', async () => {
    const mockSystemPrisma: any = {
      streamProfile: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      camera: { findUnique: vi.fn() },
    };

    const { svc } = buildService(mockSystemPrisma);
    await svc.startStream('cam-null');

    expect(mockSystemPrisma.streamProfile.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'orgA', isDefault: true },
    });
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    const addCallArgs = mockQueue.add.mock.calls[0];
    expect(addCallArgs[1].profile).toEqual({
      codec: 'auto',
      audioCodec: 'aac',
    });
  });
});
