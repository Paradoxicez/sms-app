// Quick task 260426-07r — Edge Case A3 (choice 3B) backend semantic
// alignment. Block deleting an isDefault=true profile when other profiles
// exist in the same org with HTTP 409 + a distinct error message
// "Set another profile as default before deleting this one." — preserves
// the org invariant that a populated org always has exactly one default.
//
// Tests:
//   (c) isDefault=true + 2 other profiles in org → ConflictException with
//       'Set another profile as default' substring; delete NOT called;
//       camera.findMany NOT called (proves ordering).
//   (d) isDefault=true + only profile in org → delete proceeds normally.
//
// The new check runs BEFORE the existing Phase 21 D-10 usedBy check.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { StreamProfileService } from '../../src/streams/stream-profile.service';

describe('StreamProfileService.delete — isDefault precondition (quick-260426-07r A3)', () => {
  let mockPrisma: any;
  let svc: StreamProfileService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      streamProfile: {
        findUnique: vi.fn(),
        count: vi.fn(),
        delete: vi.fn(),
      },
      camera: {
        findMany: vi.fn(),
      },
    };
    // Constructor: (prisma, streamsService?). delete() does not exercise
    // streamsService, so omit the optional second argument.
    svc = new StreamProfileService(mockPrisma);
  });

  it('(c) deleting isDefault profile with OTHER profiles in org → 409 ConflictException, delete NOT called, camera.findMany NOT called', async () => {
    mockPrisma.streamProfile.findUnique.mockResolvedValue({
      id: 'pDef',
      orgId: 'orgA',
      isDefault: true,
    });
    mockPrisma.streamProfile.count.mockResolvedValue(2);

    await expect(svc.delete('pDef')).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Re-invoke for the message assertion (mocks reset state on the
    // ConflictException instance — easiest path is a 2nd identical call).
    mockPrisma.streamProfile.findUnique.mockResolvedValue({
      id: 'pDef',
      orgId: 'orgA',
      isDefault: true,
    });
    mockPrisma.streamProfile.count.mockResolvedValue(2);
    await expect(svc.delete('pDef')).rejects.toThrow(
      /Set another profile as default/,
    );

    expect(mockPrisma.streamProfile.count).toHaveBeenCalledWith({
      where: { orgId: 'orgA', id: { not: 'pDef' } },
    });
    expect(mockPrisma.streamProfile.delete).not.toHaveBeenCalled();
    // Ordering proof: the isDefault check short-circuits BEFORE the
    // existing Phase 21 D-10 usedBy check (camera.findMany).
    expect(mockPrisma.camera.findMany).not.toHaveBeenCalled();
  });

  it('(d) deleting isDefault profile when it is the ONLY profile in org → delete proceeds (org returns to 0-profile state)', async () => {
    mockPrisma.streamProfile.findUnique.mockResolvedValue({
      id: 'pDef',
      orgId: 'orgA',
      isDefault: true,
    });
    mockPrisma.streamProfile.count.mockResolvedValue(0);
    mockPrisma.camera.findMany.mockResolvedValue([]);
    mockPrisma.streamProfile.delete.mockResolvedValue({ id: 'pDef' });

    const result = await svc.delete('pDef');

    expect(result).toEqual({ id: 'pDef' });
    expect(mockPrisma.streamProfile.delete).toHaveBeenCalledWith({
      where: { id: 'pDef' },
    });
  });
});
