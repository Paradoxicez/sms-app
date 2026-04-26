// Phase 19.1 Plan 03 — bulkImport push branch unit tests.
// D-12, D-14. Mock tenancy; transaction stub iterates with tx.camera.create.
import { describe, it, expect, vi } from 'vitest';
import { CamerasService } from '../../src/cameras/cameras.service';

function buildService() {
  const createdRows: any[] = [];
  const createFn = vi.fn(async ({ data }: any) => {
    const row = { id: `c${createdRows.length + 1}`, ...data };
    createdRows.push(row);
    return row;
  });
  const tx = { camera: { create: createFn } };
  const tenancy: any = {
    site: { findUnique: vi.fn().mockResolvedValue({ id: 'site1' }) },
    camera: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    streamProfile: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  const probeQueue = { add: vi.fn().mockResolvedValue(undefined) };
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
    undefined,
    undefined,
  );
  return { svc, tenancy, createFn, createdRows };
}

describe('CamerasService.bulkImport push rows (D-12, D-14)', () => {
  it('generates streamKey + streamUrl per push row', async () => {
    const { svc, createFn } = buildService();
    await svc.bulkImport('orgA', {
      siteId: 'site1',
      cameras: [
        { name: 'p1', ingestMode: 'push' } as any,
        { name: 'p2', ingestMode: 'push' } as any,
      ],
    } as any);
    // Two push rows must both reach tx.camera.create with generated key+URL.
    const callArgs = createFn.mock.calls.map((c: any) => c[0].data);
    expect(callArgs).toHaveLength(2);
    for (const row of callArgs) {
      expect(row.ingestMode).toBe('push');
      expect(row.streamKey).toMatch(/^[A-Za-z0-9_-]{21}$/);
      expect(row.streamUrl).toMatch(
        /^rtmp:\/\/.*:1935\/push\/[A-Za-z0-9_-]{21}$/,
      );
    }
  });

  it('response cameras[] includes id + ingestMode + streamUrl for all 3 rows in a mixed batch', async () => {
    const { svc } = buildService();
    const result = await svc.bulkImport('orgA', {
      siteId: 'site1',
      cameras: [
        { name: 'p1', ingestMode: 'push' } as any,
        { name: 'pu1', ingestMode: 'pull', streamUrl: 'rtsp://h/a' } as any,
        { name: 'p2', ingestMode: 'push' } as any,
      ],
    } as any);
    expect(result.imported).toBe(3);
    expect(result.cameras).toHaveLength(3);
    const modes = result.cameras.map((c: any) => c.ingestMode).sort();
    expect(modes).toEqual(['pull', 'push', 'push']);
    // Each push camera's streamUrl must be the rtmp push shape; pull row
    // keeps the supplied rtsp URL verbatim.
    const pushRows = result.cameras.filter((c: any) => c.ingestMode === 'push');
    for (const pr of pushRows) {
      expect(pr.streamUrl).toMatch(/^rtmp:\/\/.*\/push\//);
    }
    const pullRow = result.cameras.find((c: any) => c.ingestMode === 'pull');
    expect(pullRow?.streamUrl).toBe('rtsp://h/a');
  });

  it('pull rows unchanged — preserve supplied streamUrl, no streamKey', async () => {
    const { svc, createFn } = buildService();
    await svc.bulkImport('orgA', {
      siteId: 'site1',
      cameras: [
        { name: 'pu1', ingestMode: 'pull', streamUrl: 'rtsp://h/a' } as any,
        { name: 'pu2', ingestMode: 'pull', streamUrl: 'rtsp://h/b' } as any,
      ],
    } as any);
    const calls = createFn.mock.calls.map((c: any) => c[0].data);
    expect(calls).toHaveLength(2);
    for (const row of calls) {
      expect(row.ingestMode).toBe('pull');
      expect(row.streamKey).toBeNull();
      expect(row.streamUrl.startsWith('rtsp://')).toBe(true);
    }
  });

  it('each push row receives a distinct generated key', async () => {
    const { svc, createFn } = buildService();
    await svc.bulkImport('orgA', {
      siteId: 'site1',
      cameras: [
        { name: 'p1', ingestMode: 'push' } as any,
        { name: 'p2', ingestMode: 'push' } as any,
      ],
    } as any);
    const keys = createFn.mock.calls.map((c: any) => c[0].data.streamKey);
    expect(new Set(keys).size).toBe(2);
  });
});
