// Phase 19.1 — SrsApiService kick helpers tests (converted from Wave 0 todos).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SrsApiService } from '../../src/srs/srs-api.service';

describe('SrsApiService push helpers', () => {
  let service: SrsApiService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    // SrsApiService reads SRS_API_URL from env inside the class body at
    // construction time — set the env BEFORE instantiating.
    process.env.SRS_API_URL = 'http://test-srs:1985';
    service = new SrsApiService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('kickPublisher calls DELETE /api/v1/clients/{id}', async () => {
    const fetchSpy = vi.fn(
      async () =>
        ({ ok: true, status: 200, statusText: 'OK' }) as unknown as Response,
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    await service.kickPublisher('client-abc');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test-srs:1985/api/v1/clients/client-abc',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('kickPublisher throws on non-2xx response', async () => {
    global.fetch = vi.fn(
      async () =>
        ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    await expect(service.kickPublisher('missing')).rejects.toThrow(
      /SRS kick failed/,
    );
  });

  it('findPublisherClientId matches client by url ending with /{streamPath}', async () => {
    global.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            clients: [
              { id: 'c1', url: 'rtmp://srs/push/abc', type: 'fmle-publish' },
              { id: 'c2', url: 'rtmp://srs/live/org/cam', type: 'fmle-publish' },
            ],
          }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    const id = await service.findPublisherClientId('push/abc');
    expect(id).toBe('c1');
  });

  it('findPublisherClientId returns null when no publisher present', async () => {
    global.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ clients: [] }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    const id = await service.findPublisherClientId('push/missing');
    expect(id).toBeNull();
  });
});
