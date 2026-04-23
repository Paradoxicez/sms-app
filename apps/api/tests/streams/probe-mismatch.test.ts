// Phase 19.1 Plan 04 — StreamProbeProcessor codec-mismatch tests (D-16, D-21).
//
// When source='srs-api' AND camera.ingestMode='push' AND !needsTranscode
// (passthrough profile) AND the on-the-wire codec is not H.264/AAC:
//   • Write codecInfo.status='mismatch' with mismatchCodec populated
//   • Call SrsApiService.kickPublisher to force-disconnect the publisher
//   • Emit camera.push.publish_rejected audit (reason='codec_mismatch',
//     prefix-only key per D-21)
//
// Constructor signature:
//   (ffprobeService, prisma, srsApi, statusGateway?, auditService?)
// — 4th + 5th args are @Optional() so existing pull-mode tests still work.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamProbeProcessor } from '../../src/streams/processors/stream-probe.processor';

describe('StreamProbeProcessor codec-mismatch detection (D-16)', () => {
  let mockPrisma: any;
  let mockFfprobe: any;
  let mockSrsApi: any;
  let mockStatusGateway: any;
  let mockAuditService: any;

  function makeProcessor(camera: any) {
    mockPrisma = {
      camera: {
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(camera),
      },
    };
    return new StreamProbeProcessor(
      mockFfprobe,
      mockPrisma,
      mockSrsApi,
      mockStatusGateway,
      mockAuditService,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFfprobe = { probeCamera: vi.fn() };
    mockSrsApi = {
      getStream: vi.fn(),
      findPublisherClientId: vi.fn().mockResolvedValue('cid-123'),
      kickPublisher: vi.fn().mockResolvedValue(undefined),
    };
    mockStatusGateway = { broadcastCodecInfo: vi.fn() };
    mockAuditService = { log: vi.fn().mockResolvedValue(undefined) };
  });

  const runJob = (proc: StreamProbeProcessor, data: any) =>
    proc.process({ data } as any);

  it('passthrough profile + H.265 writes codecInfo.status=mismatch', async () => {
    const camera = {
      id: 'c1',
      orgId: 'orgA',
      ingestMode: 'push',
      streamKey: 'KEY21CHARNANOIDXXXXXX',
      needsTranscode: false,
      streamProfile: { codec: 'copy' },
    };
    const proc = makeProcessor(camera);
    mockSrsApi.getStream.mockResolvedValue({
      video: { codec: 'H.265', width: 1920, height: 1080 },
      audio: { codec: 'AAC', sample_rate: 48000, channel: 2 },
    });

    await runJob(proc, {
      cameraId: 'c1',
      orgId: 'orgA',
      streamUrl: 'rtmp://x',
      source: 'srs-api',
    });

    // pending → mismatch (2 update calls)
    expect(mockPrisma.camera.update).toHaveBeenCalledTimes(2);
    const finalCall = mockPrisma.camera.update.mock.calls[1][0];
    expect(finalCall.where).toEqual({ id: 'c1' });
    expect(finalCall.data.codecInfo).toMatchObject({
      status: 'mismatch',
      mismatchCodec: expect.stringMatching(/H\.?265/i),
      source: 'srs-api',
    });
    expect(finalCall.data.codecInfo.video).toMatchObject({ codec: 'H.265' });
    expect(finalCall.data.codecInfo.audio).toMatchObject({ codec: 'AAC' });
  });

  it('passthrough profile + H.264/AAC writes status=success (no mismatch)', async () => {
    const camera = {
      id: 'c1',
      orgId: 'orgA',
      ingestMode: 'push',
      streamKey: 'KEY21CHARNANOIDXXXXXX',
      needsTranscode: false,
      streamProfile: { codec: 'copy' },
    };
    const proc = makeProcessor(camera);
    mockSrsApi.getStream.mockResolvedValue({
      video: { codec: 'H.264', width: 1920, height: 1080 },
      audio: { codec: 'AAC', sample_rate: 48000, channel: 2 },
    });

    await runJob(proc, {
      cameraId: 'c1',
      orgId: 'orgA',
      streamUrl: 'rtmp://x',
      source: 'srs-api',
    });

    const finalCall = mockPrisma.camera.update.mock.calls[1][0];
    expect(finalCall.data.codecInfo.status).toBe('success');
    expect(mockSrsApi.kickPublisher).not.toHaveBeenCalled();
    expect(mockAuditService.log).not.toHaveBeenCalled();
  });

  it('transcode profile + H.265 writes status=success (transcode handles it)', async () => {
    const camera = {
      id: 'c1',
      orgId: 'orgA',
      ingestMode: 'push',
      streamKey: 'KEY21CHARNANOIDXXXXXX',
      needsTranscode: true,
      streamProfile: { codec: 'libx264' },
    };
    const proc = makeProcessor(camera);
    mockSrsApi.getStream.mockResolvedValue({
      video: { codec: 'H.265', width: 1920, height: 1080 },
      audio: { codec: 'AAC', sample_rate: 48000, channel: 2 },
    });

    await runJob(proc, {
      cameraId: 'c1',
      orgId: 'orgA',
      streamUrl: 'rtmp://x',
      source: 'srs-api',
    });

    const finalCall = mockPrisma.camera.update.mock.calls[1][0];
    expect(finalCall.data.codecInfo.status).toBe('success');
    expect(mockSrsApi.kickPublisher).not.toHaveBeenCalled();
  });

  it('mismatch calls SrsApiService.kickPublisher on the active client', async () => {
    const camera = {
      id: 'c1',
      orgId: 'orgA',
      ingestMode: 'push',
      streamKey: 'KEY21CHARNANOIDXXXXXX',
      needsTranscode: false,
      streamProfile: { codec: 'copy' },
    };
    const proc = makeProcessor(camera);
    mockSrsApi.getStream.mockResolvedValue({
      video: { codec: 'H.265', width: 1920, height: 1080 },
      audio: { codec: 'AAC' },
    });
    mockSrsApi.findPublisherClientId.mockResolvedValue('cid-xyz');

    await runJob(proc, {
      cameraId: 'c1',
      orgId: 'orgA',
      streamUrl: 'rtmp://x',
      source: 'srs-api',
    });

    expect(mockSrsApi.findPublisherClientId).toHaveBeenCalledWith(
      'push/KEY21CHARNANOIDXXXXXX',
    );
    expect(mockSrsApi.kickPublisher).toHaveBeenCalledWith('cid-xyz');
  });

  it('mismatch emits camera.push.publish_rejected audit with codec detail + prefix-only key', async () => {
    const camera = {
      id: 'c1',
      orgId: 'orgA',
      ingestMode: 'push',
      streamKey: 'KEY21CHARNANOIDXXXXXX',
      needsTranscode: false,
      streamProfile: { codec: 'copy' },
    };
    const proc = makeProcessor(camera);
    mockSrsApi.getStream.mockResolvedValue({
      video: { codec: 'H.265', width: 1920, height: 1080 },
      audio: { codec: 'MP3' }, // both video + audio bad — but audit uses whichever
    });

    await runJob(proc, {
      cameraId: 'c1',
      orgId: 'orgA',
      streamUrl: 'rtmp://x',
      source: 'srs-api',
    });

    expect(mockAuditService.log).toHaveBeenCalledTimes(1);
    const auditArgs = mockAuditService.log.mock.calls[0][0];
    expect(auditArgs).toMatchObject({
      orgId: 'orgA',
      action: 'camera.push.publish_rejected',
      resource: 'camera',
      resourceId: 'c1',
    });
    // D-21: prefix-only key, never the full key.
    expect(auditArgs.details.streamKeyPrefix).toBe('KEY2');
    expect(auditArgs.details.streamKeyPrefix.length).toBe(4);
    expect(auditArgs.details.reason).toBe('codec_mismatch');
    // Detected codec info present — at least one of detectedVideo/detectedAudio.
    expect(auditArgs.details.detectedVideo).toMatch(/H\.?265/i);
    expect(auditArgs.details.detectedAudio).toMatch(/MP3/i);
    // Full key must NOT appear anywhere in the audit payload.
    const payload = JSON.stringify(auditArgs);
    expect(payload).not.toContain('KEY21CHARNANOIDXXXXXX');
  });
});
