import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CamerasService } from '../../src/cameras/cameras.service';

describe('CamerasService maintenance mode', () => {
  let service: CamerasService;
  let tenancy: any;
  let prisma: any;
  let streams: any;

  beforeEach(() => {
    tenancy = {
      camera: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    prisma = {};
    streams = {
      stopStream: vi.fn().mockResolvedValue(undefined),
      startStream: vi.fn(),
    };

    // Direct instantiation — matches the pattern used by all other
    // vitest files in this repo (e.g., status/maintenance-suppression.test.ts,
    // cameras/camera-crud.test.ts). Vitest's esbuild transform doesn't emit
    // `design:paramtypes`, so NestJS DI container can't resolve classes
    // implicitly.
    service = new CamerasService(tenancy, prisma, streams, undefined as any);
  });

  it('enterMaintenance flips maintenanceMode=true, sets enteredAt + enteredBy, calls streamsService.stopStream', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: false,
      status: 'online',
      orgId: 'o1',
    });
    tenancy.camera.update
      .mockResolvedValueOnce({
        id: 'c1',
        maintenanceMode: true,
        status: 'online',
        maintenanceEnteredAt: new Date(),
        maintenanceEnteredBy: 'u1',
        orgId: 'o1',
      })
      .mockResolvedValueOnce({
        id: 'c1',
        maintenanceMode: true,
        status: 'offline',
        orgId: 'o1',
      });

    await service.enterMaintenance('c1', 'u1');

    expect(tenancy.camera.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          maintenanceMode: true,
          maintenanceEnteredBy: 'u1',
        }),
      }),
    );
    expect(streams.stopStream).toHaveBeenCalledWith('c1');
  });

  it('enterMaintenance is idempotent — returns early when maintenanceMode already true', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: true,
      status: 'offline',
      orgId: 'o1',
    });

    const result = await service.enterMaintenance('c1', 'u1');

    expect(tenancy.camera.update).not.toHaveBeenCalled();
    expect(streams.stopStream).not.toHaveBeenCalled();
    expect(result.maintenanceMode).toBe(true);
  });

  it('enterMaintenance continues to set status=offline even when stopStream throws', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: false,
      status: 'online',
      orgId: 'o1',
    });
    tenancy.camera.update
      .mockResolvedValueOnce({
        id: 'c1',
        maintenanceMode: true,
        status: 'online',
        orgId: 'o1',
      })
      .mockResolvedValueOnce({
        id: 'c1',
        maintenanceMode: true,
        status: 'offline',
        orgId: 'o1',
      });
    streams.stopStream.mockRejectedValueOnce(new Error('stream already stopped'));

    const result = await service.enterMaintenance('c1', 'u1');

    expect(streams.stopStream).toHaveBeenCalledWith('c1');
    expect(result.maintenanceMode).toBe(true);
    expect(result.status).toBe('offline');
  });

  it('enterMaintenance flips flag BEFORE calling stopStream (verifies order — 15-01 gate dependency)', async () => {
    const order: string[] = [];
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: false,
      status: 'online',
      orgId: 'o1',
    });
    tenancy.camera.update.mockImplementation(async (args: any) => {
      const tag =
        args.data.maintenanceMode === true
          ? 'update:flip-on'
          : args.data.status === 'offline'
            ? 'update:status-offline'
            : 'update:other';
      order.push(tag);
      return { id: 'c1', status: args.data.status ?? 'online', ...args.data };
    });
    streams.stopStream.mockImplementation(async () => {
      order.push('stopStream');
    });

    await service.enterMaintenance('c1', 'u1');

    expect(order[0]).toBe('update:flip-on');
    expect(order[1]).toBe('stopStream');
    // mitigates T-15-02: flag is true BEFORE transition, so 15-01 gate suppresses the notify.
  });

  it('enterMaintenance on unknown id throws NotFoundException', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce(null);

    await expect(service.enterMaintenance('missing', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tenancy.camera.update).not.toHaveBeenCalled();
    expect(streams.stopStream).not.toHaveBeenCalled();
  });

  it('exitMaintenance flips maintenanceMode=false, leaves enteredAt + enteredBy untouched', async () => {
    const historicalAt = new Date('2026-04-18T12:00:00Z');
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: true,
      status: 'offline',
      maintenanceEnteredAt: historicalAt,
      maintenanceEnteredBy: 'u1',
      orgId: 'o1',
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: false,
      status: 'offline',
      maintenanceEnteredAt: historicalAt,
      maintenanceEnteredBy: 'u1',
      orgId: 'o1',
    });

    await service.exitMaintenance('c1');

    expect(tenancy.camera.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { maintenanceMode: false },
    });
    const updateCall = tenancy.camera.update.mock.calls[0][0];
    expect(updateCall.data.maintenanceEnteredAt).toBeUndefined();
    expect(updateCall.data.maintenanceEnteredBy).toBeUndefined();
  });

  it('exitMaintenance does NOT call streamsService.startStream or stopStream (no auto-restart per D-14)', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: true,
      status: 'offline',
      orgId: 'o1',
    });
    tenancy.camera.update.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: false,
      status: 'offline',
      orgId: 'o1',
    });

    await service.exitMaintenance('c1');

    expect(streams.startStream).not.toHaveBeenCalled();
    expect(streams.stopStream).not.toHaveBeenCalled();
  });

  it('exitMaintenance is idempotent — returns early when maintenanceMode already false', async () => {
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: false,
      status: 'online',
      orgId: 'o1',
    });

    const result = await service.exitMaintenance('c1');

    expect(tenancy.camera.update).not.toHaveBeenCalled();
    expect(streams.startStream).not.toHaveBeenCalled();
    expect(streams.stopStream).not.toHaveBeenCalled();
    expect(result.maintenanceMode).toBe(false);
  });

  it('enterMaintenance writes via tenancy client, not raw prisma (org scoping — mitigates T-15-01)', async () => {
    // Mocked PrismaService is an empty object — if the service accidentally used raw prisma,
    // the call would throw. Additionally assert tenancy.camera.findUnique was called.
    tenancy.camera.findUnique.mockResolvedValueOnce({
      id: 'c1',
      maintenanceMode: false,
      status: 'online',
      orgId: 'o1',
    });
    tenancy.camera.update
      .mockResolvedValueOnce({ id: 'c1', maintenanceMode: true, status: 'online', orgId: 'o1' })
      .mockResolvedValueOnce({ id: 'c1', maintenanceMode: true, status: 'offline', orgId: 'o1' });

    await service.enterMaintenance('c1', 'u1');

    expect(tenancy.camera.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(tenancy.camera.update).toHaveBeenCalled();
  });
});
