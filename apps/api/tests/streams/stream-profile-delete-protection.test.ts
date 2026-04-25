import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { StreamProfileService } from '../../src/streams/stream-profile.service';

describe('Phase 21 — D-10 service-layer 409 protection (Option B, no schema change)', () => {
  let prisma: any;
  let service: StreamProfileService;

  beforeEach(() => {
    prisma = {
      camera: { findMany: vi.fn() },
      streamProfile: {
        delete: vi.fn().mockResolvedValue({ id: 'p1', name: 'gone' }),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    // Construct without StreamsService — delete() does not need it.
    service = new StreamProfileService(prisma);
  });

  it('DELETE /api/stream-profiles/:id with 0 cameras using it returns 200 and removes the row', async () => {
    prisma.camera.findMany.mockResolvedValue([]);
    const result = await service.delete('p1');
    expect(prisma.camera.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.streamProfile.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(result).toEqual({ id: 'p1', name: 'gone' });
  });

  it('DELETE /api/stream-profiles/:id with 1 camera using it throws ConflictException with status 409', async () => {
    prisma.camera.findMany.mockResolvedValue([{ id: 'cam-A', name: 'Front Door' }]);
    await expect(service.delete('p1')).rejects.toThrow(ConflictException);
    // Status code on ConflictException is 409
    try {
      await service.delete('p1');
      expect.fail('expected ConflictException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getStatus()).toBe(409);
    }
    expect(prisma.streamProfile.delete).not.toHaveBeenCalled();
  });

  it('409 response body shape is { message: string, usedBy: [{ cameraId, name }] }', async () => {
    prisma.camera.findMany.mockResolvedValue([
      { id: 'cam-A', name: 'Front Door' },
    ]);
    try {
      await service.delete('p1');
      expect.fail('expected ConflictException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      const response = e.getResponse();
      expect(typeof response.message).toBe('string');
      expect(response.message.length).toBeGreaterThan(0);
      expect(response.usedBy).toEqual([
        { cameraId: 'cam-A', name: 'Front Door' },
      ]);
    }
  });

  it('409 response with 2+ cameras returns all of them in usedBy[]', async () => {
    prisma.camera.findMany.mockResolvedValue([
      { id: 'cam-A', name: 'Front Door' },
      { id: 'cam-B', name: 'Back Lot' },
      { id: 'cam-C', name: 'Loading Dock' },
    ]);
    try {
      await service.delete('p1');
      expect.fail('expected ConflictException');
    } catch (e: any) {
      const response = e.getResponse();
      expect(response.usedBy).toHaveLength(3);
      expect(response.usedBy).toEqual([
        { cameraId: 'cam-A', name: 'Front Door' },
        { cameraId: 'cam-B', name: 'Back Lot' },
        { cameraId: 'cam-C', name: 'Loading Dock' },
      ]);
    }
  });

  it("usedBy query is scoped to the requester's org (Camera.findMany via TENANCY_CLIENT) — cross-org camera names never appear (T-21-02)", async () => {
    prisma.camera.findMany.mockResolvedValue([]);
    await service.delete('p1');
    // The where-clause shape MUST NOT add an explicit orgId filter — RLS via
    // TENANCY_CLIENT supplies it. This test pins the contract: the query relies
    // solely on the tenancy-bound prisma client (which the production service
    // injects via @Inject(TENANCY_CLIENT)).
    expect(prisma.camera.findMany).toHaveBeenCalledWith({
      where: { streamProfileId: 'p1' },
      select: { id: true, name: true },
    });
    // Confirm no orgId leaked into the where clause
    const call = prisma.camera.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('orgId');
  });

  it('Prisma row is NOT deleted when ConflictException is thrown', async () => {
    prisma.camera.findMany.mockResolvedValue([
      { id: 'cam-A', name: 'A' },
    ]);
    await expect(service.delete('p1')).rejects.toThrow(ConflictException);
    expect(prisma.streamProfile.delete).not.toHaveBeenCalled();
  });
});
