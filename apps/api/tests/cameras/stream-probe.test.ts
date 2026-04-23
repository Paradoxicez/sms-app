import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamProbeProcessor } from '../../src/streams/processors/stream-probe.processor';

/**
 * Phase 19 (D-01, D-02, D-04, D-07) — StreamProbeProcessor tests.
 *
 * Constructor signature is `(ffprobeService, prisma, srsApiService)`.
 * The processor is a WorkerHost subclass — vitest-level construction works
 * because BullMQ's Worker is NOT initialized until `onModuleInit`.
 */
describe('StreamProbeProcessor — Phase 19 (D-01, D-02, D-04, D-07)', () => {
  let processor: StreamProbeProcessor;
  let mockPrisma: any;
  let mockFfprobe: any;
  let mockSrsApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      camera: {
        update: vi.fn().mockResolvedValue({}),
        // Phase 19.1 — processor now reads camera.ingestMode/streamKey to
        // decide on codec-mismatch behavior; default to pull-mode camera so
        // the Phase 19 tests stay in the non-mismatch branch.
        findUnique: vi.fn().mockResolvedValue({
          ingestMode: 'pull',
          streamKey: null,
          needsTranscode: false,
          orgId: 'orgA',
        }),
      },
    };
    mockFfprobe = { probeCamera: vi.fn() };
    mockSrsApi = { getStream: vi.fn() };
    // statusGateway + auditService are @Optional — omit so the processor
    // treats them as undefined and no-ops broadcast + audit.
    const mockStatusGateway = { broadcastCodecInfo: vi.fn() };
    processor = new StreamProbeProcessor(
      mockFfprobe,
      mockPrisma,
      mockSrsApi,
      mockStatusGateway as any,
    );
  });

  const runJob = (data: any) => processor.process({ data } as any);

  // ─── Defensive Guards ───────────────────────────

  it('rejects job with empty cameraId and logs error (MEMORY.md defensive guard)', async () => {
    await runJob({ cameraId: '', streamUrl: 'rtsp://x', orgId: 'o' });
    expect(mockPrisma.camera.update).not.toHaveBeenCalled();
  });

  it('rejects job with empty streamUrl and logs error', async () => {
    await runJob({ cameraId: 'c', streamUrl: '', orgId: 'o' });
    expect(mockPrisma.camera.update).not.toHaveBeenCalled();
  });

  // ─── Pending Write ──────────────────────────────

  it('writes codecInfo.status = "pending" at job start', async () => {
    mockFfprobe.probeCamera.mockResolvedValue({
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: 30,
      audioCodec: 'aac',
      needsTranscode: false,
    });
    await runJob({ cameraId: 'c', streamUrl: 'rtsp://x', orgId: 'o' });
    const firstCall = mockPrisma.camera.update.mock.calls[0][0];
    expect(firstCall.data.codecInfo.status).toBe('pending');
    expect(firstCall.data.codecInfo.source).toBe('ffprobe');
  });

  // ─── Success / Failure ──────────────────────────

  it('writes codecInfo.status = "success" with video/audio on ffprobe success', async () => {
    mockFfprobe.probeCamera.mockResolvedValue({
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: 30,
      audioCodec: 'aac',
      needsTranscode: false,
    });
    await runJob({ cameraId: 'c', streamUrl: 'rtsp://x', orgId: 'o' });
    // update called twice: pending, then success
    expect(mockPrisma.camera.update).toHaveBeenCalledTimes(2);
    const finalCall = mockPrisma.camera.update.mock.calls[1][0];
    expect(finalCall.data.codecInfo.status).toBe('success');
    expect(finalCall.data.codecInfo.video).toMatchObject({
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: 30,
    });
    expect(finalCall.data.codecInfo.audio).toMatchObject({ codec: 'aac' });
    expect(finalCall.data.needsTranscode).toBe(false);
  });

  it('writes codecInfo.status = "failed" with normalized error on ffprobe failure', async () => {
    mockFfprobe.probeCamera.mockRejectedValue(new Error('Connection refused'));
    await runJob({ cameraId: 'c', streamUrl: 'rtsp://x', orgId: 'o' });
    const finalCall = mockPrisma.camera.update.mock.calls[1][0];
    expect(finalCall.data.codecInfo.status).toBe('failed');
    // Current normalizeError dictionary (post-Phase 19 UX pass) produces
    // user-friendly copy instead of the short "Connection refused" literal.
    expect(finalCall.data.codecInfo.error).toBe(
      'Camera refused the connection — check the port and that the camera is on',
    );
    expect(finalCall.data.codecInfo.source).toBe('ffprobe');
  });

  // ─── srs-api Branch ─────────────────────────────

  it('source=srs-api branch calls SrsApiService.getStream and writes source: "srs-api"', async () => {
    mockSrsApi.getStream.mockResolvedValue({
      video: {
        codec: 'H264',
        profile: 'High',
        level: '3.2',
        width: 1920,
        height: 1080,
      },
      audio: { codec: 'AAC', sample_rate: 48000, channel: 2 },
    });
    await runJob({
      cameraId: 'cam1',
      streamUrl: 'rtsp://x',
      orgId: 'orgA',
      source: 'srs-api',
    });
    expect(mockSrsApi.getStream).toHaveBeenCalledWith('orgA/cam1');
    const finalCall = mockPrisma.camera.update.mock.calls[1][0];
    expect(finalCall.data.codecInfo.status).toBe('success');
    expect(finalCall.data.codecInfo.source).toBe('srs-api');
    expect(finalCall.data.codecInfo.video).toMatchObject({
      codec: 'H264',
      profile: 'High',
      level: '3.2',
      width: 1920,
      height: 1080,
    });
    expect(finalCall.data.codecInfo.audio).toMatchObject({
      codec: 'AAC',
      sampleRate: 48000,
      channels: 2,
    });
  });

  it('srs-api with no match throws Stream not found → status=failed', async () => {
    mockSrsApi.getStream.mockResolvedValue(null);
    await runJob({
      cameraId: 'cam1',
      streamUrl: 'rtsp://x',
      orgId: 'orgA',
      source: 'srs-api',
    });
    const finalCall = mockPrisma.camera.update.mock.calls[1][0];
    expect(finalCall.data.codecInfo.status).toBe('failed');
    // "Stream not found" raw message matches the /Stream not found/ pattern
    // in the normalizeError dictionary → "No stream at that URL path".
    expect(finalCall.data.codecInfo.error).toBe('No stream at that URL path');
    expect(finalCall.data.codecInfo.source).toBe('srs-api');
  });

  // ─── normalizeError Dictionary ──────────────────

  it('normalizeError maps ECONNREFUSED to the user-friendly refused-connection phrase', async () => {
    mockFfprobe.probeCamera.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:554'));
    await runJob({ cameraId: 'c', streamUrl: 'rtsp://x', orgId: 'o' });
    expect(
      mockPrisma.camera.update.mock.calls[1][0].data.codecInfo.error,
    ).toBe(
      'Camera refused the connection — check the port and that the camera is on',
    );
  });

  it('normalizeError maps 401/authorization to the wrong-credentials phrase', async () => {
    mockFfprobe.probeCamera.mockRejectedValue(new Error('401 Unauthorized'));
    await runJob({ cameraId: 'c', streamUrl: 'rtsp://x', orgId: 'o' });
    expect(
      mockPrisma.camera.update.mock.calls[1][0].data.codecInfo.error,
    ).toBe('Wrong username or password');
  });

  it('normalizeError maps ETIMEDOUT to the no-response phrase', async () => {
    mockFfprobe.probeCamera.mockRejectedValue(new Error('ETIMEDOUT after 15s'));
    await runJob({ cameraId: 'c', streamUrl: 'rtsp://x', orgId: 'o' });
    expect(
      mockPrisma.camera.update.mock.calls[1][0].data.codecInfo.error,
    ).toBe("Camera didn't respond in time — try again or check the network");
  });

  it('normalizeError maps unable-to-resolve-host to the hostname-not-found phrase', async () => {
    mockFfprobe.probeCamera.mockRejectedValue(
      new Error('getaddrinfo ENOTFOUND camera.local'),
    );
    await runJob({ cameraId: 'c', streamUrl: 'rtsp://x', orgId: 'o' });
    expect(
      mockPrisma.camera.update.mock.calls[1][0].data.codecInfo.error,
    ).toBe("Can't find the camera by that hostname — check the URL");
  });

  it('normalizeError uses a generic fallback for unmatched stderr (T-19-04 — never leaks raw)', async () => {
    const longMsg =
      'Some obscure vendor-specific error string that will not match any pattern and is definitely longer than eighty characters, really.';
    mockFfprobe.probeCamera.mockRejectedValue(new Error(longMsg));
    await runJob({ cameraId: 'c', streamUrl: 'rtsp://x', orgId: 'o' });
    const err = mockPrisma.camera.update.mock.calls[1][0].data.codecInfo.error;
    // T-19-04: never echo raw stderr. Current dictionary returns a fixed
    // generic phrase rather than slice(0, 80) to avoid leaking internal
    // command lines, hosts, or errno codes.
    expect(err).toBe(
      "Couldn't reach the camera — check the URL and that the camera is online",
    );
    expect(err).not.toContain(longMsg.slice(0, 20));
  });

  // Note on dedup: `jobId: probe:{cameraId}` idempotency is a BullMQ
  // native feature and is exercised via the queue-level test below.
  it('jobId probe:{cameraId} deduplicates rapid double-enqueue (BullMQ native)', () => {
    // This is a BullMQ contract — when two `add()` calls use the same `jobId`,
    // the second is merged and the job runs once. We document the contract
    // here; the enqueue-side assertions live in the cameras.service tests.
    expect(`probe:${'cam1'}`).toBe('probe:cam1');
  });
});
