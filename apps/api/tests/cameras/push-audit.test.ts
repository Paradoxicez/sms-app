// Phase 19.1 Plan 03 — push-specific audit invariants (D-07, D-21).
//
// Covers the Plan 03-owned audit events:
//   - camera.push.key_generated (createCamera push branch)
//   - camera.push.key_rotated   (rotateStreamKey)
//
// Events owned by Plan 02 (publish_rejected, first_publish) are verified
// in srs-callback-push.test.ts. The critical invariant tested here is the
// LEAK DETECTOR: no audit payload across the push surface may contain a
// 21-char nanoid substring — only the 4-char streamKeyPrefix is permitted.
import { describe, it, expect, vi } from 'vitest';
import { CamerasService } from '../../src/cameras/cameras.service';

function buildService(camera?: any) {
  const tenancy: any = {
    site: { findUnique: vi.fn().mockResolvedValue({ id: 'site1' }) },
    camera: {
      create: vi.fn(async ({ data }: any) => ({ id: 'c1', ...data })),
      findUnique: vi.fn().mockResolvedValue(camera ?? null),
      update: vi.fn(async ({ data }: any) => ({ ...(camera ?? {}), ...data })),
      count: vi.fn().mockResolvedValue(0),
    },
    organization: { findUnique: vi.fn() },
  };
  const srsApi = {
    findPublisherClientId: vi.fn().mockResolvedValue(null),
    kickPublisher: vi.fn(),
  };
  const probeQueue = { add: vi.fn().mockResolvedValue(undefined) };
  const auditService = { log: vi.fn().mockResolvedValue(undefined) };
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
    prismaService as any,
    {} as any,
    probeQueue as any,
    undefined,
    srsApi as any,
    auditService as any,
  );
  return { svc, tenancy, auditService };
}

describe('Push audit events (D-21, D-07 prefix-only invariant)', () => {
  it('camera.push.key_generated emitted on createCamera(push)', async () => {
    const { svc, auditService } = buildService();
    await svc.createCamera('orgA', 'site1', {
      name: 'cam',
      ingestMode: 'push',
    } as any);
    const actions = auditService.log.mock.calls.map((c: any) => c[0].action);
    expect(actions).toContain('camera.push.key_generated');
  });

  it('camera.push.key_rotated emitted on rotateStreamKey', async () => {
    const cam = {
      id: 'c1',
      orgId: 'orgA',
      ingestMode: 'push',
      streamKey: 'rotKEY12345678901234X',
      streamUrl: 'rtmp://h:1935/push/rotKEY12345678901234X',
    };
    const { svc, auditService } = buildService(cam);
    await svc.rotateStreamKey('c1', 'user1');
    const actions = auditService.log.mock.calls.map((c: any) => c[0].action);
    expect(actions).toContain('camera.push.key_rotated');
  });

  it('all Plan 03 push audit payloads carry streamKeyPrefix with exactly 4 chars', async () => {
    const cam = {
      id: 'c1',
      orgId: 'orgA',
      ingestMode: 'push',
      streamKey: 'prefKEY1234567890123X',
      streamUrl: 'rtmp://h:1935/push/prefKEY1234567890123X',
    };
    const { svc, auditService } = buildService(cam);
    await svc.createCamera('orgA', 'site1', {
      name: 'cam',
      ingestMode: 'push',
    } as any);
    await svc.rotateStreamKey('c1', 'user1');
    for (const call of auditService.log.mock.calls) {
      const payload = call[0];
      const details = payload.details ?? {};
      const prefixes = [details.streamKeyPrefix, details.oldKeyPrefix, details.newKeyPrefix].filter(
        (p): p is string => typeof p === 'string',
      );
      expect(prefixes.length).toBeGreaterThanOrEqual(1);
      for (const p of prefixes) {
        expect(p).toMatch(/^[A-Za-z0-9_-]{4}$/);
      }
    }
  });

  it('LEAK DETECTOR: no Plan 03 push audit payload contains a 21-char nanoid substring', async () => {
    const cam = {
      id: 'c1',
      orgId: 'orgA',
      ingestMode: 'push',
      streamKey: 'leakKEY1234567890123X',
      streamUrl: 'rtmp://h:1935/push/leakKEY1234567890123X',
    };
    const { svc, auditService } = buildService(cam);
    await svc.createCamera('orgA', 'site1', {
      name: 'cam',
      ingestMode: 'push',
    } as any);
    await svc.rotateStreamKey('c1', 'user1');
    for (const call of auditService.log.mock.calls) {
      const json = JSON.stringify(call[0]);
      expect(json).not.toMatch(/[A-Za-z0-9_-]{21}/);
    }
  });

  it('pull camera creation does NOT emit camera.push.key_generated', async () => {
    const { svc, auditService } = buildService();
    await svc.createCamera('orgA', 'site1', {
      name: 'cam',
      ingestMode: 'pull',
      streamUrl: 'rtsp://h/a',
    } as any);
    const actions = auditService.log.mock.calls.map((c: any) => c[0].action);
    expect(actions).not.toContain('camera.push.key_generated');
  });

  it('rotateStreamKey on pull camera does NOT emit an audit (BadRequestException short-circuits)', async () => {
    const pullCam = {
      id: 'c1',
      orgId: 'orgA',
      ingestMode: 'pull',
      streamKey: null,
      streamUrl: 'rtsp://h/a',
    };
    const { svc, auditService } = buildService(pullCam);
    await expect(svc.rotateStreamKey('c1', 'user1')).rejects.toThrow();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
