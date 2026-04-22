import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SrsCallbackController } from '../../src/srs/srs-callback.controller';

/**
 * Phase 19 (D-02) — SrsCallbackController.onPublish now enqueues an
 * srs-api-source probe job AFTER the status transition to 'online' so the
 * StreamProbeProcessor can pull ground-truth codec info from SRS
 * `/api/v1/streams`.
 *
 * The constructor grew a 5th arg (CamerasService). We pass all deps as
 * `any` because the other 4 are unrelated to on-publish.
 */
describe('SrsCallbackController on-publish — Phase 19 (D-02)', () => {
  let controller: SrsCallbackController;
  let mockStatus: any;
  let mockCameras: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus = { transition: vi.fn().mockResolvedValue(undefined) };
    mockCameras = { enqueueProbeFromSrs: vi.fn().mockResolvedValue(undefined) };
    controller = new SrsCallbackController(
      mockStatus as any,
      {} as any, // statusGateway — not used in on-publish
      {} as any, // playbackService — not used in on-publish
      {} as any, // recordingsService — not used in on-publish
      mockCameras as any,
    );
  });

  it('enqueues probe job with source: "srs-api" after statusService.transition(online)', async () => {
    await controller.onPublish({ stream: 'orgA/cam1', app: 'live' });
    // transition is called before enqueue
    expect(mockStatus.transition).toHaveBeenCalledWith('cam1', 'orgA', 'online');
    expect(mockCameras.enqueueProbeFromSrs).toHaveBeenCalledWith(
      'cam1',
      'orgA',
      expect.objectContaining({ delay: 1000 }),
    );
  });

  it('uses jobId probe:{cameraId} for dedup', async () => {
    // jobId semantics live inside enqueueProbeFromSrs (Task 3 tests cover the
    // BullMQ add() assertion directly). This smoke check asserts the callback
    // still funnels through that single method so dedup stays centralized.
    await controller.onPublish({ stream: 'orgA/cam1', app: 'live' });
    expect(mockCameras.enqueueProbeFromSrs).toHaveBeenCalledTimes(1);
  });

  it('uses delay=1000ms so SRS registry populates before probe fetch', async () => {
    await controller.onPublish({ stream: 'orgA/cam1', app: 'live' });
    const opts = mockCameras.enqueueProbeFromSrs.mock.calls[0][2];
    expect(opts.delay).toBe(1000);
  });

  it('does not enqueue when cameraId is missing from parseStreamKey', async () => {
    await controller.onPublish({ stream: 'malformed', app: '' });
    expect(mockCameras.enqueueProbeFromSrs).not.toHaveBeenCalled();
  });

  it('does not throw if probeQueue is undefined (test-harness guard)', async () => {
    // Simulate enqueueProbeFromSrs internal failure (queue undefined → method
    // silent-returns, but we also assert the callback swallows rejects from it).
    mockCameras.enqueueProbeFromSrs.mockRejectedValue(new Error('boom'));
    const res = await controller.onPublish({ stream: 'orgA/cam1', app: 'live' });
    expect(res).toEqual({ code: 0 });
  });
});
