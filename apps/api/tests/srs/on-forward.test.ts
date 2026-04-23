// Phase 19.1 Plan 02 — SrsCallbackController on_forward endpoint (D-18).
// Covers push→live passthrough remap, transcode path (empty urls),
// recursion guard (app=live → empty urls), and unknown-key tolerance.

import { describe, it, expect, vi } from 'vitest';
import { SrsCallbackController } from '../../src/srs/srs-callback.controller';

function makeController(resolveForwardTarget: any) {
  const camerasService = {
    findByStreamKey: vi.fn(),
    enqueueProbeFromSrs: vi.fn(),
    markFirstPublishIfNeeded: vi.fn(),
    resolveForwardTarget,
  };
  const ctrl = new SrsCallbackController(
    { transition: vi.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    camerasService as any,
    { log: vi.fn() } as any,
  );
  return { ctrl, camerasService };
}

describe('SrsCallbackController on_forward (D-18)', () => {
  it('app=push + passthrough → returns target URL with live/{orgId}/{cameraId}', async () => {
    const { ctrl } = makeController(
      vi
        .fn()
        .mockResolvedValue({ orgId: 'orgA', cameraId: 'cam1', needsTranscode: false }),
    );
    const res = await ctrl.onForward({
      action: 'on_forward',
      app: 'push',
      stream: 'KEY',
      vhost: '__defaultVhost__',
    });
    expect(res).toEqual({
      code: 0,
      data: { urls: [expect.stringMatching(/rtmp:\/\/.*\/live\/orgA\/cam1$/)] },
    });
  });

  it('app=push + needsTranscode → returns empty urls', async () => {
    const { ctrl } = makeController(
      vi
        .fn()
        .mockResolvedValue({ orgId: 'orgA', cameraId: 'cam1', needsTranscode: true }),
    );
    const res = await ctrl.onForward({
      action: 'on_forward',
      app: 'push',
      stream: 'KEY',
      vhost: '__defaultVhost__',
    });
    expect(res).toEqual({ code: 0, data: { urls: [] } });
  });

  it('app=live → returns empty urls (recursion guard)', async () => {
    const { ctrl, camerasService } = makeController(vi.fn());
    const res = await ctrl.onForward({
      action: 'on_forward',
      app: 'live',
      stream: 'orgA/cam1',
      vhost: '__defaultVhost__',
    });
    expect(res).toEqual({ code: 0, data: { urls: [] } });
    expect(camerasService.resolveForwardTarget).not.toHaveBeenCalled();
  });

  it('unknown streamKey → returns empty urls', async () => {
    const { ctrl } = makeController(vi.fn().mockResolvedValue(null));
    const res = await ctrl.onForward({
      action: 'on_forward',
      app: 'push',
      stream: 'UNKNOWN',
      vhost: '__defaultVhost__',
    });
    expect(res).toEqual({ code: 0, data: { urls: [] } });
  });
});
