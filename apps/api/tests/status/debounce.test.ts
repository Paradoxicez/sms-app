import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusService } from '../../src/status/status.service';

describe('StatusService debounce-by-replacement', () => {
  let service: StatusService;
  let mockPrisma: any;
  let mockGateway: any;
  let mockWebhooksService: any;
  let mockNotificationsService: any;
  let mockNotifyQueue: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGateway = {
      broadcastStatus: vi.fn(),
      broadcastViewerCount: vi.fn(),
    };

    mockPrisma = {
      camera: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    // These should NEVER be called directly from transition() under the new design.
    mockWebhooksService = {
      emitEvent: vi.fn().mockResolvedValue(undefined),
    };
    mockNotificationsService = {
      createForCameraEvent: vi.fn().mockResolvedValue(undefined),
    };

    mockNotifyQueue = {
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue(undefined),
    };

    service = new StatusService(
      mockPrisma,
      mockGateway as any,
      mockWebhooksService,
      mockNotificationsService,
      mockNotifyQueue as any,
    );
  });

  it('schedules delayed job with deterministic jobId on first transition', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'connecting',
      name: 'Cam 1',
      maintenanceMode: false,
    });

    await service.transition('cam1', 'org1', 'online');

    expect(mockNotifyQueue.getJob).toHaveBeenCalledWith('camera:cam1:notify');
    expect(mockNotifyQueue.add).toHaveBeenCalledTimes(1);
    expect(mockNotifyQueue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({
        orgId: 'org1',
        cameraId: 'cam1',
        cameraName: 'Cam 1',
        newStatus: 'online',
        previousStatus: 'connecting',
      }),
      expect.objectContaining({
        jobId: 'camera:cam1:notify',
        delay: 30_000,
        removeOnComplete: true,
        removeOnFail: 10,
      }),
    );
    // Confirm no direct webhook/notification call from transition.
    expect(mockWebhooksService.emitEvent).not.toHaveBeenCalled();
    expect(mockNotificationsService.createForCameraEvent).not.toHaveBeenCalled();
  });

  it('replaces pending job when a second transition fires inside the window', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'connecting',
      name: 'Cam 1',
      maintenanceMode: false,
    });

    const stubJob = { remove: vi.fn().mockResolvedValue(undefined) };
    // Second transition finds a pending job.
    mockNotifyQueue.getJob
      .mockResolvedValueOnce(null) // first call: no existing
      .mockResolvedValueOnce(stubJob); // second call: existing

    await service.transition('cam1', 'org1', 'online');

    // Now imagine the status flips before the delay elapses.
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'online',
      name: 'Cam 1',
      maintenanceMode: false,
    });

    await service.transition('cam1', 'org1', 'offline');

    expect(stubJob.remove).toHaveBeenCalledTimes(1);
    expect(mockNotifyQueue.add).toHaveBeenCalledTimes(2);

    // Second add carries the newer status.
    const secondAddCall = mockNotifyQueue.add.mock.calls[1];
    expect(secondAddCall[1]).toEqual(
      expect.objectContaining({ newStatus: 'offline', previousStatus: 'online' }),
    );
    expect(secondAddCall[2]).toEqual(
      expect.objectContaining({ jobId: 'camera:cam1:notify', delay: 30_000 }),
    );
  });

  it('does not enqueue for non-notifiable status (connecting)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'offline',
      name: 'Cam 1',
      maintenanceMode: false,
    });

    await service.transition('cam1', 'org1', 'connecting');

    expect(mockGateway.broadcastStatus).toHaveBeenCalledWith('org1', 'cam1', 'connecting');
    expect(mockNotifyQueue.add).not.toHaveBeenCalled();
  });

  it('does not enqueue when newStatus === currentStatus (no-op guard)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'online',
      name: 'Cam 1',
      maintenanceMode: false,
    });

    await service.transition('cam1', 'org1', 'online');

    expect(mockPrisma.camera.update).not.toHaveBeenCalled();
    expect(mockGateway.broadcastStatus).not.toHaveBeenCalled();
    expect(mockNotifyQueue.add).not.toHaveBeenCalled();
  });
});
