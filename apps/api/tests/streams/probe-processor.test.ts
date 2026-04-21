import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamProbeProcessor } from '../../src/streams/processors/stream-probe.processor';

describe('StreamProbeProcessor', () => {
  let ffprobe: any;
  let prisma: any;
  let processor: StreamProbeProcessor;

  beforeEach(() => {
    ffprobe = { probeCamera: vi.fn() };
    prisma = { camera: { update: vi.fn().mockResolvedValue({}) } };
    processor = new StreamProbeProcessor(ffprobe, prisma);
  });

  it('persists codecInfo on successful probe', async () => {
    ffprobe.probeCamera.mockResolvedValue({
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: 30,
      audioCodec: 'aac',
      needsTranscode: false,
    });

    await processor.process({
      data: { cameraId: 'cam-1', streamUrl: 'rtsp://1.1.1.1/s', orgId: 'org-1' },
    } as any);

    expect(ffprobe.probeCamera).toHaveBeenCalledWith('rtsp://1.1.1.1/s');
    expect(prisma.camera.update).toHaveBeenCalledWith({
      where: { id: 'cam-1' },
      data: {
        needsTranscode: false,
        codecInfo: expect.objectContaining({
          codec: 'h264',
          width: 1920,
          height: 1080,
          fps: 30,
          audioCodec: 'aac',
          probedAt: expect.any(String),
        }),
      },
    });
  });

  it('records hevc as needsTranscode=true', async () => {
    ffprobe.probeCamera.mockResolvedValue({
      codec: 'hevc',
      width: 3840,
      height: 2160,
      fps: 30,
      audioCodec: 'aac',
      needsTranscode: true,
    });

    await processor.process({
      data: { cameraId: 'cam-2', streamUrl: 'rtsp://2.2.2.2/s', orgId: 'org-1' },
    } as any);

    expect(prisma.camera.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ needsTranscode: true }),
      }),
    );
  });

  it('records error in codecInfo and does NOT throw on probe failure', async () => {
    ffprobe.probeCamera.mockRejectedValue(new Error('connection refused'));

    await expect(
      processor.process({
        data: { cameraId: 'cam-3', streamUrl: 'rtsp://3.3.3.3/s', orgId: 'org-1' },
      } as any),
    ).resolves.toBeUndefined();

    expect(prisma.camera.update).toHaveBeenCalledWith({
      where: { id: 'cam-3' },
      data: {
        codecInfo: expect.objectContaining({
          error: 'connection refused',
          probedAt: expect.any(String),
        }),
      },
    });
  });

  it('survives a DB error in the error-recording branch (logs only)', async () => {
    ffprobe.probeCamera.mockRejectedValue(new Error('probe fail'));
    prisma.camera.update.mockRejectedValue(new Error('db fail'));

    await expect(
      processor.process({
        data: { cameraId: 'cam-4', streamUrl: 'rtsp://4.4.4.4/s', orgId: 'org-1' },
      } as any),
    ).resolves.toBeUndefined();
  });
});
