// Phase 19.1 Plan 03 — rotateStreamKey unit tests.
// D-19, D-20, D-21. Mock tenancy + srsApi + auditService; no DB.
import { describe, it, expect, vi } from 'vitest';
import { CamerasService } from '../../src/cameras/cameras.service';
import { BadRequestException } from '@nestjs/common';

function buildService(camera: any, srsOverrides: any = {}) {
  const tenancy: any = {
    site: { findUnique: vi.fn() },
    camera: {
      findUnique: vi.fn().mockResolvedValue(camera),
      update: vi.fn(async ({ data }: any) => ({ ...camera, ...data })),
      count: vi.fn().mockResolvedValue(0),
    },
    organization: { findUnique: vi.fn() },
  };
  const srsApi = {
    findPublisherClientId: vi.fn().mockResolvedValue('client-old'),
    kickPublisher: vi.fn().mockResolvedValue(undefined),
    ...srsOverrides,
  };
  const auditService = { log: vi.fn().mockResolvedValue(undefined) };
  const svc = new CamerasService(
    tenancy,
    {} as any,
    {} as any,
    undefined,
    undefined,
    srsApi as any,
    auditService as any,
  );
  return { svc, tenancy, srsApi, auditService };
}

describe('CamerasService.rotateStreamKey (D-19, D-20)', () => {
  // 21-char stream keys — the format buildPushUrl expects.
  const oldFullKey = 'oldKEY12345678901234X';
  const camera = {
    id: 'c1',
    orgId: 'orgA',
    ingestMode: 'push',
    streamKey: oldFullKey,
    streamUrl: `rtmp://h:1935/push/${oldFullKey}`,
  };

  it('generates new key + URL in a single transactional update', async () => {
    const { svc, tenancy } = buildService(camera);
    const r = await svc.rotateStreamKey('c1', 'user1');
    expect(tenancy.camera.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          streamKey: expect.stringMatching(/^[A-Za-z0-9_-]{21}$/),
          streamUrl: expect.stringMatching(
            /^rtmp:\/\/.*\/push\/[A-Za-z0-9_-]{21}$/,
          ),
        }),
      }),
    );
    expect(r.streamUrl).toMatch(/^rtmp:\/\//);
  });

  it('calls SrsApiService.kickPublisher with resolved old client id', async () => {
    const { svc, srsApi } = buildService(camera);
    await svc.rotateStreamKey('c1', 'user1');
    expect(srsApi.findPublisherClientId).toHaveBeenCalledWith(
      `push/${oldFullKey}`,
    );
    expect(srsApi.kickPublisher).toHaveBeenCalledWith('client-old');
  });

  it('tolerates kick failure — new key stays live', async () => {
    const { svc } = buildService(camera, {
      kickPublisher: vi.fn().mockRejectedValue(new Error('SRS down')),
    });
    await expect(svc.rotateStreamKey('c1', 'user1')).resolves.toEqual(
      expect.objectContaining({
        streamUrl: expect.stringMatching(/^rtmp:\/\//),
      }),
    );
  });

  it('throws BadRequestException on pull cameras', async () => {
    const pullCam = { ...camera, ingestMode: 'pull', streamKey: null };
    const { svc } = buildService(pullCam);
    await expect(svc.rotateStreamKey('c1', 'user1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('emits camera.push.key_rotated audit with old+new prefixes', async () => {
    const { svc, auditService } = buildService(camera);
    await svc.rotateStreamKey('c1', 'user1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'camera.push.key_rotated',
        details: expect.objectContaining({
          oldKeyPrefix: oldFullKey.slice(0, 4),
          newKeyPrefix: expect.stringMatching(/^[A-Za-z0-9_-]{4}$/),
        }),
      }),
    );
  });
});
