// Phase 19.1 Plan 02 — SrsCallbackController on_publish app=push branch.
// Covers D-15 (push key lookup), D-21 (publish_rejected + first_publish
// audits), D-23 (maintenance does not block publish). See Plan 02 Task 2.

import { describe, it, expect, vi } from 'vitest';
import { SrsCallbackController } from '../../src/srs/srs-callback.controller';

function makeController(
  overrides: {
    statusService?: any;
    statusGateway?: any;
    playbackService?: any;
    recordingsService?: any;
    camerasService?: any;
    auditService?: any;
  } = {},
) {
  const statusService =
    overrides.statusService ?? { transition: vi.fn().mockResolvedValue(undefined) };
  const statusGateway = overrides.statusGateway ?? { emit: vi.fn() };
  const playbackService = overrides.playbackService ?? {};
  const recordingsService = overrides.recordingsService ?? {};
  const camerasService =
    overrides.camerasService ?? {
      findByStreamKey: vi.fn().mockResolvedValue(null),
      enqueueProbeFromSrs: vi.fn().mockResolvedValue(undefined),
      markFirstPublishIfNeeded: vi.fn().mockResolvedValue(false),
      resolveForwardTarget: vi.fn().mockResolvedValue(null),
    };
  const auditService =
    overrides.auditService ?? { log: vi.fn().mockResolvedValue(undefined) };
  const streamsService =
    (overrides as any).streamsService ?? {
      startStream: vi.fn().mockResolvedValue(undefined),
    };
  const ctrl = new SrsCallbackController(
    statusService as any,
    statusGateway as any,
    playbackService as any,
    recordingsService as any,
    camerasService as any,
    streamsService as any,
    auditService as any,
  );
  return { ctrl, statusService, camerasService, auditService, streamsService };
}

describe('SrsCallbackController on_publish app=push (D-15)', () => {
  it('resolves streamKey via findFirst and transitions camera online', async () => {
    const { ctrl, statusService, camerasService } = makeController({
      camerasService: {
        findByStreamKey: vi.fn().mockResolvedValue({
          id: 'cam1',
          orgId: 'orgA',
          maintenanceMode: false,
          firstPublishAt: null,
        }),
        enqueueProbeFromSrs: vi.fn().mockResolvedValue(undefined),
        markFirstPublishIfNeeded: vi.fn().mockResolvedValue(true),
      },
    });
    const res = await ctrl.onPublish({
      app: 'push',
      stream: 'KEY123',
      ip: '1.1.1.1',
    });
    expect(res).toEqual({ code: 0 });
    expect(camerasService.findByStreamKey).toHaveBeenCalledWith('KEY123');
    expect(statusService.transition).toHaveBeenCalledWith('cam1', 'orgA', 'online');
  });

  it('unknown streamKey returns { code: 403 } and emits publish_rejected', async () => {
    const { ctrl, auditService } = makeController({
      camerasService: {
        findByStreamKey: vi.fn().mockResolvedValue(null),
        enqueueProbeFromSrs: vi.fn(),
        markFirstPublishIfNeeded: vi.fn(),
      },
    });
    const res = await ctrl.onPublish({
      app: 'push',
      stream: 'UNKNWN99',
      ip: '9.9.9.9',
    });
    expect(res).toEqual({ code: 403 });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'camera.push.publish_rejected',
        orgId: 'system',
        ip: '9.9.9.9',
        details: expect.objectContaining({
          streamKeyPrefix: 'UNKN',
          reason: 'unknown_key',
        }),
      }),
    );
  });

  it('existing app=live branch unchanged — transitions + enqueues probe', async () => {
    const { ctrl, statusService, camerasService } = makeController();
    const res = await ctrl.onPublish({ app: 'live', stream: 'orgA/cam1' });
    expect(res).toEqual({ code: 0 });
    expect(statusService.transition).toHaveBeenCalledWith('cam1', 'orgA', 'online');
    expect(camerasService.findByStreamKey).not.toHaveBeenCalled();
  });

  it('extension-strip logic is NOT applied to push keys', async () => {
    const { ctrl, camerasService } = makeController({
      camerasService: {
        findByStreamKey: vi.fn().mockResolvedValue(null),
        enqueueProbeFromSrs: vi.fn(),
        markFirstPublishIfNeeded: vi.fn(),
      },
    });
    await ctrl.onPublish({ app: 'push', stream: 'abc.m3u8' });
    // If extension-strip were applied we'd see findByStreamKey('abc') —
    // this assertion locks in the canonical-key behavior for push.
    expect(camerasService.findByStreamKey).toHaveBeenCalledWith('abc.m3u8');
  });

  it('maintenanceMode=true still returns { code: 0 } for push (D-23)', async () => {
    const { ctrl, statusService } = makeController({
      camerasService: {
        findByStreamKey: vi.fn().mockResolvedValue({
          id: 'cam1',
          orgId: 'orgA',
          maintenanceMode: true,
          firstPublishAt: new Date(),
        }),
        enqueueProbeFromSrs: vi.fn().mockResolvedValue(undefined),
        markFirstPublishIfNeeded: vi.fn().mockResolvedValue(false),
      },
    });
    const res = await ctrl.onPublish({
      app: 'push',
      stream: 'KEY',
      ip: '1.1.1.1',
    });
    expect(res).toEqual({ code: 0 });
    expect(statusService.transition).toHaveBeenCalled();
  });

  it('enqueueProbeFromSrs called with delay:1000 for push', async () => {
    const { ctrl, camerasService } = makeController({
      camerasService: {
        findByStreamKey: vi.fn().mockResolvedValue({
          id: 'cam1',
          orgId: 'orgA',
          maintenanceMode: false,
          firstPublishAt: null,
        }),
        enqueueProbeFromSrs: vi.fn().mockResolvedValue(undefined),
        markFirstPublishIfNeeded: vi.fn().mockResolvedValue(true),
      },
    });
    await ctrl.onPublish({ app: 'push', stream: 'KEY' });
    expect(camerasService.enqueueProbeFromSrs).toHaveBeenCalledWith(
      'cam1',
      'orgA',
      expect.objectContaining({ delay: 1000 }),
    );
  });

  it('markFirstPublishIfNeeded=true triggers first_publish audit', async () => {
    const { ctrl, auditService } = makeController({
      camerasService: {
        findByStreamKey: vi.fn().mockResolvedValue({
          id: 'cam1',
          orgId: 'orgA',
          maintenanceMode: false,
          firstPublishAt: null,
        }),
        enqueueProbeFromSrs: vi.fn().mockResolvedValue(undefined),
        markFirstPublishIfNeeded: vi.fn().mockResolvedValue(true),
      },
    });
    await ctrl.onPublish({ app: 'push', stream: 'KEY', ip: '5.5.5.5' });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'camera.push.first_publish',
        orgId: 'orgA',
        resourceId: 'cam1',
        ip: '5.5.5.5',
      }),
    );
  });
});
