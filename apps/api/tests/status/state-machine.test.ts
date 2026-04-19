import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusService } from '../../src/status/status.service';
import { StatusGateway } from '../../src/status/status.gateway';

describe('Camera Status State Machine', () => {
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
    } as unknown as StatusGateway;

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
      mockGateway,
      mockWebhooksService,
      mockNotificationsService,
      mockNotifyQueue as any,
    );
  });

  // Valid transitions
  it('should allow transition offline -> connecting', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'offline' });
    await service.transition('cam-1', 'org-1', 'connecting');
    expect(mockPrisma.camera.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cam-1' },
        data: expect.objectContaining({ status: 'connecting' }),
      }),
    );
  });

  it('should allow transition connecting -> online', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'connecting' });
    await service.transition('cam-1', 'org-1', 'online');
    expect(mockPrisma.camera.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'online' }),
      }),
    );
  });

  it('should set lastOnlineAt when transitioning to online', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'connecting' });
    await service.transition('cam-1', 'org-1', 'online');
    expect(mockPrisma.camera.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'online',
          lastOnlineAt: expect.any(Date),
        }),
      }),
    );
  });

  it('should allow transition online -> reconnecting', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'online' });
    await service.transition('cam-1', 'org-1', 'reconnecting');
    expect(mockPrisma.camera.update).toHaveBeenCalled();
  });

  it('should allow transition reconnecting -> online (retry success)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'reconnecting' });
    await service.transition('cam-1', 'org-1', 'online');
    expect(mockPrisma.camera.update).toHaveBeenCalled();
  });

  it('should allow transition reconnecting -> offline (max retries)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'reconnecting' });
    await service.transition('cam-1', 'org-1', 'offline');
    expect(mockPrisma.camera.update).toHaveBeenCalled();
  });

  it('should allow transition online -> degraded', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'online' });
    await service.transition('cam-1', 'org-1', 'degraded');
    expect(mockPrisma.camera.update).toHaveBeenCalled();
  });

  it('should allow transition degraded -> online', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'degraded' });
    await service.transition('cam-1', 'org-1', 'online');
    expect(mockPrisma.camera.update).toHaveBeenCalled();
  });

  it('should allow transition connecting -> offline (any state -> offline on stop)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'connecting' });
    await service.transition('cam-1', 'org-1', 'offline');
    expect(mockPrisma.camera.update).toHaveBeenCalled();
  });

  // Invalid transitions
  it('should reject transition offline -> online (must go through connecting)', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'offline' });
    await expect(service.transition('cam-1', 'org-1', 'online')).rejects.toThrow(
      'Invalid transition: offline -> online',
    );
  });

  // Socket.IO broadcasting
  it('should broadcast status change via Socket.IO to org room', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({ id: 'cam-1', status: 'offline' });
    await service.transition('cam-1', 'org-1', 'connecting');
    expect(mockGateway.broadcastStatus).toHaveBeenCalledWith('org-1', 'cam-1', 'connecting');
  });

  // Camera not found
  it('should throw when camera not found', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue(null);
    await expect(service.transition('nonexistent', 'org-1', 'online')).rejects.toThrow(
      'Camera nonexistent not found',
    );
  });
});

describe('Viewer Counting', () => {
  let service: StatusService;

  beforeEach(() => {
    const mockPrisma = { camera: { findUnique: vi.fn(), update: vi.fn() } };
    const mockGateway = { broadcastStatus: vi.fn(), broadcastViewerCount: vi.fn() };
    const mockWebhooks = { emitEvent: vi.fn().mockResolvedValue(undefined) };
    const mockNotifications = { createForCameraEvent: vi.fn().mockResolvedValue(undefined) };
    const mockNotifyQueue = { getJob: vi.fn().mockResolvedValue(null), add: vi.fn().mockResolvedValue(undefined) };
    service = new StatusService(
      mockPrisma as any,
      mockGateway as any,
      mockWebhooks as any,
      mockNotifications as any,
      mockNotifyQueue as any,
    );
  });

  it('should increment viewer count', () => {
    expect(service.incrementViewers('cam-1')).toBe(1);
    expect(service.incrementViewers('cam-1')).toBe(2);
    expect(service.incrementViewers('cam-1')).toBe(3);
  });

  it('should decrement viewer count', () => {
    service.incrementViewers('cam-1');
    service.incrementViewers('cam-1');
    expect(service.decrementViewers('cam-1')).toBe(1);
  });

  it('should never go below 0 on decrement', () => {
    expect(service.decrementViewers('cam-1')).toBe(0);
    expect(service.decrementViewers('cam-1')).toBe(0);
  });

  it('should return 0 for unknown camera', () => {
    expect(service.getViewerCount('unknown')).toBe(0);
  });
});
