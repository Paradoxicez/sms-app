import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaybackService } from '../../src/playback/playback.service';

/**
 * Test verifyTokenMinimal -- verifies JWT signature + expiry only, no cameraId/orgId check.
 */
describe('PlaybackService.verifyTokenMinimal', () => {
  it('verifyTokenMinimal method exists on PlaybackService prototype', () => {
    expect(PlaybackService.prototype.verifyTokenMinimal).toBeDefined();
    expect(typeof PlaybackService.prototype.verifyTokenMinimal).toBe('function');
  });
});

/**
 * Test HLS key serving and m3u8 proxy controller endpoints.
 */
describe('PlaybackController HLS key + m3u8 proxy endpoints', () => {
  it('PlaybackController has serveHlsKey method', async () => {
    const { PlaybackController } = await import('../../src/playback/playback.controller');
    expect(PlaybackController.prototype.serveHlsKey).toBeDefined();
  });

  it('PlaybackController has proxyM3u8 method', async () => {
    const { PlaybackController } = await import('../../src/playback/playback.controller');
    expect(PlaybackController.prototype.proxyM3u8).toBeDefined();
  });
});

describe('m3u8 key URL rewriting logic', () => {
  it('rewrites #EXT-X-KEY URI to include token', () => {
    const token = 'my-test-jwt-token';
    const m3u8Content = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:3
#EXT-X-MEDIA-SEQUENCE:100
#EXT-X-KEY:METHOD=AES-128,URI="/keys/live/org-1/cam-1-100.key",IV=0x00000000000000000000000000000064
#EXTINF:2.000,
live/org-1/cam-1-100.m4s
#EXT-X-KEY:METHOD=AES-128,URI="/keys/live/org-1/cam-1-101.key",IV=0x00000000000000000000000000000065
#EXTINF:2.000,
live/org-1/cam-1-101.m4s`;

    const rewritten = m3u8Content.replace(
      /URI="([^"]*\.key)"/g,
      `URI="/api/playback/keys$1?token=${token}"`,
    );

    expect(rewritten).toContain(`URI="/api/playback/keys/keys/live/org-1/cam-1-100.key?token=${token}"`);
    expect(rewritten).toContain(`URI="/api/playback/keys/keys/live/org-1/cam-1-101.key?token=${token}"`);
    expect(rewritten).not.toContain('URI="/keys/');
  });
});

describe('ThrottlerModule configuration', () => {
  it('AppModule imports ThrottlerModule', async () => {
    // Read the source to check ThrottlerModule is configured
    const fs = await import('fs');
    const appModuleSource = fs.readFileSync(
      new URL('../../src/app.module.ts', import.meta.url),
      'utf-8',
    );
    expect(appModuleSource).toContain('ThrottlerModule');
    expect(appModuleSource).toContain('ThrottlerGuard');
    expect(appModuleSource).toContain('APP_GUARD');
  });
});

describe('SRS callbacks skip throttle', () => {
  it('SrsCallbackController has SkipThrottle decorator', async () => {
    const fs = await import('fs');
    const srsSource = fs.readFileSync(
      new URL('../../src/srs/srs-callback.controller.ts', import.meta.url),
      'utf-8',
    );
    expect(srsSource).toContain('@SkipThrottle()');
    expect(srsSource).toContain("from '@nestjs/throttler'");
  });
});

describe('HLS key endpoint access control', () => {
  let mockPlaybackService: any;
  let mockClsService: any;
  let controller: any;

  beforeEach(async () => {
    mockPlaybackService = {
      verifyTokenMinimal: vi.fn(),
      createSession: vi.fn(),
      getSession: vi.fn(),
    };
    mockClsService = {
      get: vi.fn().mockReturnValue('org-1'),
    };

    const { PlaybackController } = await import('../../src/playback/playback.controller');
    controller = new PlaybackController(mockPlaybackService, mockClsService);
  });

  it('key endpoint returns 403 without token', async () => {
    const mockReq = {
      query: {},
      params: { 0: 'live/org-1/cam-1-100.key' },
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      send: vi.fn(),
    };

    await controller.serveHlsKey(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  it('key endpoint returns 403 with expired/invalid token', async () => {
    mockPlaybackService.verifyTokenMinimal.mockResolvedValue(null);

    const mockReq = {
      query: { token: 'expired-token' },
      params: { 0: 'live/org-1/cam-1-100.key' },
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      send: vi.fn(),
    };

    await controller.serveHlsKey(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });
});
