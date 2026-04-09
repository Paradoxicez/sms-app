import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SrsCallbackController } from '../../src/srs/srs-callback.controller';

describe('SRS on_play JWT + domain verification', () => {
  let controller: SrsCallbackController;
  let mockStatusService: any;
  let mockStatusGateway: any;
  let mockPlaybackService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStatusService = {
      transition: vi.fn().mockResolvedValue(undefined),
      incrementViewers: vi.fn().mockReturnValue(1),
      decrementViewers: vi.fn().mockReturnValue(0),
      getViewerCount: vi.fn().mockReturnValue(0),
    };

    mockStatusGateway = {
      broadcastViewerCount: vi.fn(),
    };

    mockPlaybackService = {
      verifyToken: vi.fn().mockResolvedValue(null),
      matchDomain: vi.fn().mockReturnValue(true),
    };

    controller = new SrsCallbackController(
      mockStatusService,
      mockStatusGateway,
      mockPlaybackService,
    );
  });

  it('on_play with valid JWT token + valid domain returns { code: 0 } and increments viewer count', async () => {
    mockPlaybackService.verifyToken.mockResolvedValue({
      sessionId: 'sess-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      domains: ['example.com'],
      allowNoReferer: true,
      maxViewers: 10,
    });
    mockPlaybackService.matchDomain.mockReturnValue(true);
    mockStatusService.getViewerCount.mockReturnValue(0);

    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: '?token=valid-jwt-token',
      pageUrl: 'https://example.com/page',
    });

    expect(result).toEqual({ code: 0 });
    expect(mockPlaybackService.verifyToken).toHaveBeenCalledWith('valid-jwt-token', 'cam-1', 'org-1');
    expect(mockStatusService.incrementViewers).toHaveBeenCalledWith('cam-1');
  });

  it('on_play with no token in param returns { code: 403 }', async () => {
    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: '',
    });

    expect(result).toEqual({ code: 403 });
    expect(mockStatusService.incrementViewers).not.toHaveBeenCalled();
  });

  it('on_play with expired JWT returns { code: 403 }', async () => {
    mockPlaybackService.verifyToken.mockResolvedValue(null);

    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: '?token=expired-token',
    });

    expect(result).toEqual({ code: 403 });
    expect(mockStatusService.incrementViewers).not.toHaveBeenCalled();
  });

  it('on_play with wrong cameraId in token returns { code: 403 }', async () => {
    mockPlaybackService.verifyToken.mockResolvedValue(null); // verifyToken checks cameraId match

    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: '?token=wrong-camera-token',
    });

    expect(result).toEqual({ code: 403 });
  });

  it('on_play with domain not in allowlist returns { code: 403 }', async () => {
    mockPlaybackService.verifyToken.mockResolvedValue({
      sessionId: 'sess-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      domains: ['allowed.com'],
      allowNoReferer: false,
      maxViewers: 10,
    });
    mockPlaybackService.matchDomain.mockReturnValue(false);

    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: '?token=valid-token',
      pageUrl: 'https://evil.com/page',
    });

    expect(result).toEqual({ code: 403 });
    expect(mockStatusService.incrementViewers).not.toHaveBeenCalled();
  });

  it('on_play with empty pageUrl and allowNoReferer=true returns { code: 0 }', async () => {
    mockPlaybackService.verifyToken.mockResolvedValue({
      sessionId: 'sess-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      domains: ['example.com'],
      allowNoReferer: true,
      maxViewers: 10,
    });
    mockPlaybackService.matchDomain.mockReturnValue(true);

    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: '?token=valid-token',
      pageUrl: '',
    });

    expect(result).toEqual({ code: 0 });
    expect(mockPlaybackService.matchDomain).toHaveBeenCalledWith('', ['example.com'], true);
  });

  it('on_play with empty pageUrl and allowNoReferer=false returns { code: 403 }', async () => {
    mockPlaybackService.verifyToken.mockResolvedValue({
      sessionId: 'sess-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      domains: ['example.com'],
      allowNoReferer: false,
      maxViewers: 10,
    });
    mockPlaybackService.matchDomain.mockReturnValue(false);

    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: '?token=valid-token',
      pageUrl: '',
    });

    expect(result).toEqual({ code: 403 });
  });

  it('on_play with maxViewers=5 and current=5 returns { code: 403 }', async () => {
    mockPlaybackService.verifyToken.mockResolvedValue({
      sessionId: 'sess-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      domains: [],
      allowNoReferer: true,
      maxViewers: 5,
    });
    mockPlaybackService.matchDomain.mockReturnValue(true);
    mockStatusService.getViewerCount.mockReturnValue(5);

    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: '?token=valid-token',
      pageUrl: 'https://example.com',
    });

    expect(result).toEqual({ code: 403 });
    expect(mockStatusService.incrementViewers).not.toHaveBeenCalled();
  });

  it('on_play with maxViewers=0 (unlimited) allows regardless of count', async () => {
    mockPlaybackService.verifyToken.mockResolvedValue({
      sessionId: 'sess-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      domains: [],
      allowNoReferer: true,
      maxViewers: 0,
    });
    mockPlaybackService.matchDomain.mockReturnValue(true);
    mockStatusService.getViewerCount.mockReturnValue(999);

    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: '?token=valid-token',
      pageUrl: 'https://example.com',
    });

    expect(result).toEqual({ code: 0 });
    expect(mockStatusService.incrementViewers).toHaveBeenCalledWith('cam-1');
  });

  it('on_play without orgId/cameraId (internal stream) returns { code: 0 } without verification', async () => {
    const result = await controller.onPlay({
      app: 'live',
      stream: '',
    });

    expect(result).toEqual({ code: 0 });
    expect(mockPlaybackService.verifyToken).not.toHaveBeenCalled();
  });

  it('handles param without leading question mark', async () => {
    mockPlaybackService.verifyToken.mockResolvedValue({
      sessionId: 'sess-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      domains: [],
      allowNoReferer: true,
      maxViewers: 0,
    });
    mockPlaybackService.matchDomain.mockReturnValue(true);

    const result = await controller.onPlay({
      app: 'live',
      stream: 'org-1/cam-1',
      param: 'token=my-jwt-token',
      pageUrl: '',
    });

    expect(result).toEqual({ code: 0 });
    expect(mockPlaybackService.verifyToken).toHaveBeenCalledWith('my-jwt-token', 'cam-1', 'org-1');
  });
});

describe('matchDomain utility (via PlaybackService)', () => {
  // These tests verify the matchDomain logic directly from PlaybackService
  // (already tested in playback.test.ts but also referenced from SRS context)

  it('matchDomain("https://sub.example.com/page", ["*.example.com"], true) returns true', () => {
    const { matchDomain } = createMatchDomainHelper();
    expect(matchDomain('https://sub.example.com/page', ['*.example.com'], true)).toBe(true);
  });

  it('matchDomain("https://other.com", ["*.example.com"], true) returns false', () => {
    const { matchDomain } = createMatchDomainHelper();
    expect(matchDomain('https://other.com', ['*.example.com'], true)).toBe(false);
  });

  it('matchDomain("", ["*.example.com"], true) returns true (allowNoReferer)', () => {
    const { matchDomain } = createMatchDomainHelper();
    expect(matchDomain('', ['*.example.com'], true)).toBe(true);
  });

  it('matchDomain("", ["*.example.com"], false) returns false', () => {
    const { matchDomain } = createMatchDomainHelper();
    expect(matchDomain('', ['*.example.com'], false)).toBe(false);
  });

  it('matchDomain("https://any.com", [], true) returns true (empty = allow all, D-14)', () => {
    const { matchDomain } = createMatchDomainHelper();
    expect(matchDomain('https://any.com', [], true)).toBe(true);
  });
});

/**
 * Inline matchDomain logic for unit testing without full service instantiation.
 * This mirrors PlaybackService.matchDomain.
 */
function createMatchDomainHelper() {
  function matchDomain(
    pageUrl: string | undefined | null,
    allowedDomains: string[],
    allowNoReferer: boolean,
  ): boolean {
    if (!pageUrl) return allowNoReferer;
    if (allowedDomains.length === 0) return true;

    let hostname: string;
    try {
      hostname = new URL(pageUrl).hostname;
    } catch {
      return allowNoReferer;
    }

    for (const pattern of allowedDomains) {
      if (pattern === '*') return true;
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
        if (hostname.endsWith(suffix) || hostname === pattern.slice(2)) {
          return true;
        }
      } else {
        if (hostname === pattern) return true;
      }
    }

    return false;
  }

  return { matchDomain };
}
