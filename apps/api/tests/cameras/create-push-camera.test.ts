// Phase 19.1 Plan 03 — CamerasService.createCamera push branch tests.
// D-01, D-04, D-05, D-21. Mock tenancy + auditService + probeQueue; no DB.
import { describe, it, expect, vi } from 'vitest';
import { CamerasService } from '../../src/cameras/cameras.service';
import { Prisma } from '@prisma/client';
import { DuplicateStreamKeyError } from '../../src/cameras/errors/duplicate-stream-key.error';

function buildService(
  tenancyOverrides: any = {},
  opts: any = {},
): {
  svc: CamerasService;
  tenancy: any;
  auditService: any;
  probeQueue: any;
} {
  const tenancy: any = {
    site: { findUnique: vi.fn().mockResolvedValue({ id: 'site1' }) },
    camera: {
      create:
        tenancyOverrides.create ??
        vi.fn(async ({ data }: any) => ({ id: 'c1', ...data })),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    organization: { findUnique: vi.fn().mockResolvedValue({ maxCameras: 100 }) },
    ...tenancyOverrides,
  };
  const probeQueue =
    opts.probeQueue ?? { add: vi.fn().mockResolvedValue(undefined) };
  const auditService =
    opts.auditService ?? { log: vi.fn().mockResolvedValue(undefined) };
  const srsApi = opts.srsApi ?? {};
  const prismaService = {
    organization: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ package: { maxCameras: 100 } }),
    },
    camera: { count: vi.fn().mockResolvedValue(0) },
  };
  const svc = new CamerasService(
    tenancy,
    prismaService as any, // PrismaService
    {} as any, // StreamsService
    probeQueue as any,
    undefined, // systemPrisma
    srsApi as any,
    auditService as any,
  );
  return { svc, tenancy, auditService, probeQueue };
}

describe('CamerasService.createCamera ingestMode=push (D-01, D-05)', () => {
  it('generates streamKey + full streamUrl and stores both', async () => {
    const { svc, tenancy } = buildService();
    const result = await svc.createCamera('orgA', 'site1', {
      name: 'cam',
      ingestMode: 'push',
    } as any);
    expect(tenancy.camera.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ingestMode: 'push',
          streamKey: expect.stringMatching(/^[A-Za-z0-9_-]{21}$/),
          streamUrl: expect.stringMatching(
            /^rtmp:\/\/.*:1935\/push\/[A-Za-z0-9_-]{21}$/,
          ),
        }),
      }),
    );
    expect(result.ingestMode).toBe('push');
  });

  it('emits camera.push.key_generated audit with 4-char prefix only', async () => {
    const { svc, auditService } = buildService();
    await svc.createCamera('orgA', 'site1', {
      name: 'cam',
      ingestMode: 'push',
    } as any);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'camera.push.key_generated',
        details: expect.objectContaining({
          streamKeyPrefix: expect.stringMatching(/^[A-Za-z0-9_-]{4}$/),
        }),
      }),
    );
    // Defensive invariant: the full 21-char key must never appear in the
    // audit payload. This is the same check push-audit.test.ts codifies
    // separately across all push audit events.
    const call = auditService.log.mock.calls[0][0];
    expect(JSON.stringify(call)).not.toMatch(/[A-Za-z0-9_-]{21}/);
  });

  it('translates P2002 on streamKey to DuplicateStreamKeyError', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('unique failed', {
      code: 'P2002',
      clientVersion: 'x',
      meta: { target: ['streamKey'] },
    } as any);
    const { svc } = buildService({
      camera: {
        create: vi.fn().mockRejectedValue(err),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn(),
      },
    });
    await expect(
      svc.createCamera('orgA', 'site1', {
        name: 'cam',
        ingestMode: 'push',
      } as any),
    ).rejects.toBeInstanceOf(DuplicateStreamKeyError);
  });

  it('pull path unchanged (no audit, no streamKey)', async () => {
    const { svc, auditService, tenancy } = buildService();
    await svc.createCamera('orgA', 'site1', {
      name: 'cam',
      ingestMode: 'pull',
      streamUrl: 'rtsp://host/a',
    } as any);
    expect(tenancy.camera.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ streamKey: null, ingestMode: 'pull' }),
      }),
    );
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('enqueues probe with probe-{cameraId}-ffprobe jobId', async () => {
    const { svc, probeQueue } = buildService();
    await svc.createCamera('orgA', 'site1', {
      name: 'cam',
      ingestMode: 'push',
    } as any);
    expect(probeQueue.add).toHaveBeenCalledWith(
      'probe-camera',
      expect.anything(),
      expect.objectContaining({ jobId: 'probe-c1-ffprobe' }),
    );
  });
});
