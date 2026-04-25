// Quick task 260426-29p — auto-mark first profile per org as isDefault=true.
// Closes the "0 default profile in populated org" invariant gap that the
// runtime fallback (260426-07r) would otherwise absorb.
//
// Tests:
//   (a) dto.isDefault=false on EMPTY org (count=0)
//       → persisted profile has isDefault=true, logger.log emits
//         "auto-marked first profile" message.
//   (b) dto.isDefault=false on POPULATED org (count=3)
//       → persisted profile keeps isDefault=false, updateMany NOT called,
//         no auto-mark log.
//   (c) dto.isDefault=true on EMPTY org (count=0)
//       → persisted profile is isDefault=true, updateMany still fires
//         (existing mutual-exclusion path; matches 0 rows), no auto-mark
//         log because dto.isDefault was already true.
//   (d) dto.isDefault=true on POPULATED org (count=2)
//       → persisted profile is isDefault=true, updateMany unsets prior
//         defaults; existing behavior preserved unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamProfileService } from '../../src/streams/stream-profile.service';

describe('StreamProfileService.create — auto-default first profile (260426-29p)', () => {
  let mockPrisma: any;
  let svc: StreamProfileService;
  let logSpy: ReturnType<typeof vi.spyOn>;

  const baseDto = {
    name: 'HD 15',
    codec: 'libx264',
    preset: 'veryfast',
    resolution: '1920x1080',
    fps: 15,
    videoBitrate: '2000',
    audioCodec: 'aac',
    audioBitrate: '128',
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      streamProfile: {
        count: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'new-id', ...data }),
        ),
      },
    };
    svc = new StreamProfileService(mockPrisma);
    // Suppress + observe logger output. Logger is private; reach in via any-cast.
    logSpy = vi.spyOn((svc as any).logger, 'log').mockImplementation(() => {});
  });

  it('(a) dto.isDefault=false on EMPTY org → persisted profile has isDefault=true; logger emits auto-marked message', async () => {
    mockPrisma.streamProfile.count.mockResolvedValue(0);
    const result = await svc.create('orgA', { ...baseDto, isDefault: false });
    expect(mockPrisma.streamProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'orgA', isDefault: true }),
      }),
    );
    expect(result.isDefault).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/auto-marked first profile "HD 15" as isDefault=true for org orgA/),
    );
  });

  it('(b) dto.isDefault=false on POPULATED org → persisted profile keeps isDefault=false; updateMany NOT called', async () => {
    mockPrisma.streamProfile.count.mockResolvedValue(3);
    const result = await svc.create('orgA', { ...baseDto, isDefault: false });
    expect(mockPrisma.streamProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'orgA', isDefault: false }),
      }),
    );
    expect(result.isDefault).toBe(false);
    expect(mockPrisma.streamProfile.updateMany).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('(c) dto.isDefault=true on EMPTY org → persisted profile is isDefault=true (no regression); no auto-mark log', async () => {
    mockPrisma.streamProfile.count.mockResolvedValue(0);
    const result = await svc.create('orgA', { ...baseDto, isDefault: true });
    expect(result.isDefault).toBe(true);
    // updateMany still fires (existing mutual-exclusion path) but matches 0 rows — that is acceptable.
    expect(mockPrisma.streamProfile.updateMany).toHaveBeenCalledTimes(1);
    // No auto-mark log because dto.isDefault was already true.
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('(d) dto.isDefault=true on POPULATED org → updateMany unsets prior defaults; persisted profile is isDefault=true', async () => {
    mockPrisma.streamProfile.count.mockResolvedValue(2);
    const result = await svc.create('orgA', { ...baseDto, isDefault: true });
    expect(mockPrisma.streamProfile.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'orgA', isDefault: true },
      data: { isDefault: false },
    });
    expect(result.isDefault).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
