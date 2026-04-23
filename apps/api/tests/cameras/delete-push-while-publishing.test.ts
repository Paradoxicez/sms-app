// Phase 19.1 Plan 03 — deleteCamera push + active publish tests.
// D-22. Mock tenancy + srsApi; no DB.
import { describe, it, expect, vi } from 'vitest';
import { CamerasService } from '../../src/cameras/cameras.service';

describe('CamerasService.deleteCamera push + active publish (D-22)', () => {
  function build(cam: any, opts: any = {}) {
    const tenancy: any = {
      site: { findUnique: vi.fn() },
      camera: {
        findUnique: vi.fn().mockResolvedValue(cam),
        delete: vi.fn().mockResolvedValue(cam),
        count: vi.fn(),
      },
      organization: { findUnique: vi.fn() },
    };
    const srsApi = {
      findPublisherClientId: vi.fn(),
      kickPublisher: vi.fn(),
      ...opts,
    };
    const svc = new CamerasService(
      tenancy,
      {} as any,
      {} as any,
      undefined,
      undefined,
      srsApi as any,
      { log: vi.fn() } as any,
    );
    return { svc, srsApi, tenancy };
  }

  it('kicks the SRS publisher via /api/v1/clients/{id} DELETE', async () => {
    const { svc, srsApi, tenancy } = build(
      { id: 'c1', ingestMode: 'push', streamKey: 'KEY123456789012345678' },
      {
        findPublisherClientId: vi.fn().mockResolvedValue('client-x'),
        kickPublisher: vi.fn().mockResolvedValue(undefined),
      },
    );
    await svc.deleteCamera('c1');
    expect(srsApi.findPublisherClientId).toHaveBeenCalledWith(
      'push/KEY123456789012345678',
    );
    expect(srsApi.kickPublisher).toHaveBeenCalledWith('client-x');
    expect(tenancy.camera.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it('hard-deletes even if kick fails', async () => {
    const { svc, tenancy } = build(
      { id: 'c1', ingestMode: 'push', streamKey: 'KEY123456789012345678' },
      {
        findPublisherClientId: vi.fn().mockResolvedValue('client-x'),
        kickPublisher: vi.fn().mockRejectedValue(new Error('boom')),
      },
    );
    await expect(svc.deleteCamera('c1')).resolves.toBeTruthy();
    expect(tenancy.camera.delete).toHaveBeenCalled();
  });

  it('does not kick for pull cameras', async () => {
    const { svc, srsApi } = build({
      id: 'c2',
      ingestMode: 'pull',
      streamKey: null,
    });
    await svc.deleteCamera('c2');
    expect(srsApi.findPublisherClientId).not.toHaveBeenCalled();
  });
});
