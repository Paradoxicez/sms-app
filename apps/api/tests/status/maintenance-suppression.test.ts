import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusService } from '../../src/status/status.service';
import { NotifyDispatchProcessor } from '../../src/status/processors/notify-dispatch.processor';

describe('StatusService maintenance gate', () => {
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

  it('when maintenanceMode=true, broadcasts status and updates DB but does NOT enqueue notify', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'online',
      name: 'Cam 1',
      maintenanceMode: true,
    });

    await service.transition('cam1', 'org1', 'offline');

    expect(mockPrisma.camera.update).toHaveBeenCalledTimes(1);
    expect(mockGateway.broadcastStatus).toHaveBeenCalledWith('org1', 'cam1', 'offline');
    expect(mockNotifyQueue.add).not.toHaveBeenCalled();
    expect(mockWebhooksService.emitEvent).not.toHaveBeenCalled();
    expect(mockNotificationsService.createForCameraEvent).not.toHaveBeenCalled();
  });

  it('when maintenanceMode=false, broadcasts + enqueues as normal', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'online',
      name: 'Cam 1',
      maintenanceMode: false,
    });

    await service.transition('cam1', 'org1', 'offline');

    expect(mockPrisma.camera.update).toHaveBeenCalledTimes(1);
    expect(mockGateway.broadcastStatus).toHaveBeenCalledWith('org1', 'cam1', 'offline');
    expect(mockNotifyQueue.add).toHaveBeenCalledTimes(1);
    expect(mockNotifyQueue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({
        orgId: 'org1',
        cameraId: 'cam1',
        newStatus: 'offline',
        previousStatus: 'online',
      }),
      expect.objectContaining({ jobId: 'camera:cam1:notify', delay: 30_000 }),
    );
  });
});

describe('NotifyDispatchProcessor', () => {
  let processor: NotifyDispatchProcessor;
  let mockPrisma: any;
  let mockWebhooksService: any;
  let mockNotificationsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      camera: {
        findUnique: vi.fn(),
      },
    };

    mockWebhooksService = {
      emitEvent: vi.fn().mockResolvedValue(undefined),
    };

    mockNotificationsService = {
      createForCameraEvent: vi.fn().mockResolvedValue(undefined),
    };

    processor = new NotifyDispatchProcessor(
      mockPrisma,
      mockWebhooksService,
      mockNotificationsService,
    );
  });

  const jobStub = (overrides: Record<string, any> = {}) =>
    ({
      data: {
        orgId: 'org1',
        cameraId: 'cam1',
        cameraName: 'Cam 1',
        newStatus: 'offline',
        previousStatus: 'online',
        ...overrides,
      },
    }) as any;

  it('suppresses when camera flips into maintenance during 30s window', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'offline',
      maintenanceMode: true,
    });

    await processor.process(jobStub());

    expect(mockWebhooksService.emitEvent).not.toHaveBeenCalled();
    expect(mockNotificationsService.createForCameraEvent).not.toHaveBeenCalled();
  });

  it('suppresses when status drifted during debounce', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'online', // drifted: job.data.newStatus=offline but camera is now online
      maintenanceMode: false,
    });

    await processor.process(jobStub({ newStatus: 'offline' }));

    expect(mockWebhooksService.emitEvent).not.toHaveBeenCalled();
    expect(mockNotificationsService.createForCameraEvent).not.toHaveBeenCalled();
  });

  it('delivers on happy path', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam1',
      status: 'offline',
      maintenanceMode: false,
    });

    await processor.process(jobStub({ newStatus: 'offline' }));

    expect(mockWebhooksService.emitEvent).toHaveBeenCalledTimes(1);
    expect(mockWebhooksService.emitEvent).toHaveBeenCalledWith(
      'org1',
      'camera.offline',
      expect.objectContaining({
        cameraId: 'cam1',
        status: 'offline',
        previousStatus: 'online',
      }),
    );
    expect(mockNotificationsService.createForCameraEvent).toHaveBeenCalledTimes(1);
    expect(mockNotificationsService.createForCameraEvent).toHaveBeenCalledWith(
      'org1',
      'cam1',
      'offline',
      'Cam 1',
    );
  });

  it('skips silently when camera no longer exists', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue(null);

    await processor.process(jobStub());

    expect(mockWebhooksService.emitEvent).not.toHaveBeenCalled();
    expect(mockNotificationsService.createForCameraEvent).not.toHaveBeenCalled();
  });
});
