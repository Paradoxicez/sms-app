import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Playback routing to edges', () => {
  let playbackService: any;

  const mockPrisma = {
    camera: { findUnique: vi.fn() },
    playbackSession: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockPoliciesService = {
    resolve: vi.fn(),
  };

  const mockStatusService = {
    getViewerCount: vi.fn().mockReturnValue(0),
  };

  const mockClusterService = {
    getLeastLoadedEdge: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock jsonwebtoken
    vi.doMock('jsonwebtoken', () => ({
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn(),
    }));

    process.env.JWT_PLAYBACK_SECRET = 'test-secret';

    const { PlaybackService } = await import(
      '../../src/playback/playback.service'
    );
    playbackService = new PlaybackService(
      mockPrisma as any,
      mockPrisma as any, // systemPrisma — same mock for createSession test path
      mockPoliciesService as any,
      mockStatusService as any,
      mockClusterService as any,
    );
  });

  it('should route to least-loaded edge when online edges exist', async () => {
    const camera = { id: 'cam-1', orgId: 'org-1' };
    mockPrisma.camera.findUnique.mockResolvedValue(camera);
    mockPoliciesService.resolve.mockResolvedValue({
      ttlSeconds: 120,
      maxViewers: 0,
      domains: [],
      allowNoReferer: true,
    });
    mockPrisma.playbackSession.create.mockResolvedValue({
      id: 'session-1',
      orgId: 'org-1',
      cameraId: 'cam-1',
    });
    mockPrisma.playbackSession.update.mockImplementation(({ data }: any) => ({
      id: 'session-1',
      hlsUrl: data.hlsUrl,
      expiresAt: new Date(),
    }));

    mockClusterService.getLeastLoadedEdge.mockResolvedValue({
      id: 'edge-1',
      name: 'Edge 1',
      hlsUrl: 'http://edge1:8080',
      status: 'ONLINE',
    });

    const result = await playbackService.createSession('cam-1', 'org-1');

    expect(mockClusterService.getLeastLoadedEdge).toHaveBeenCalled();
    expect(result.hlsUrl).toContain('http://edge1:8080/live/org-1/cam-1.m3u8');
    expect(result.hlsUrl).toContain('token=mock-jwt-token');
  });

  it('should fall back to origin HLS URL when no online edges', async () => {
    const camera = { id: 'cam-2', orgId: 'org-2' };
    mockPrisma.camera.findUnique.mockResolvedValue(camera);
    mockPoliciesService.resolve.mockResolvedValue({
      ttlSeconds: 120,
      maxViewers: 0,
      domains: [],
      allowNoReferer: true,
    });
    mockPrisma.playbackSession.create.mockResolvedValue({
      id: 'session-2',
      orgId: 'org-2',
      cameraId: 'cam-2',
    });
    mockPrisma.playbackSession.update.mockImplementation(({ data }: any) => ({
      id: 'session-2',
      hlsUrl: data.hlsUrl,
      expiresAt: new Date(),
    }));

    mockClusterService.getLeastLoadedEdge.mockResolvedValue(null);

    const result = await playbackService.createSession('cam-2', 'org-2');

    // Playback base URL comes from env; in tests with no env override it is
    // the Nest default `http://localhost:8080`. Assert the path structure is
    // correct and that the JWT is appended.
    expect(result.hlsUrl).toMatch(/\/live\/org-2\/cam-2\.m3u8/);
    expect(result.hlsUrl).toContain('token=mock-jwt-token');
  });
});

describe('createSystemSession (system-context for background callers)', () => {
  let playbackService: any;

  // Single shared mock used for BOTH tenantPrisma and systemPrisma slots.
  // The test asserts the contract (same return shape, viewer-limit skipped,
  // org mismatch rejected) — production code reaches systemPrisma; in tests
  // we cannot distinguish which constructor slot was hit because the same
  // object is passed to both. That's intentional and acceptable.
  const mockPrisma = {
    camera: { findUnique: vi.fn() },
    playbackSession: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockPoliciesService = {
    resolve: vi.fn(),
  };

  const mockStatusService = {
    getViewerCount: vi.fn().mockReturnValue(0),
  };

  const mockClusterService = {
    getLeastLoadedEdge: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    vi.doMock('jsonwebtoken', () => ({
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn(),
    }));

    process.env.JWT_PLAYBACK_SECRET = 'test-secret';

    const { PlaybackService } = await import(
      '../../src/playback/playback.service'
    );
    playbackService = new PlaybackService(
      mockPrisma as any,
      mockPrisma as any, // systemPrisma — what createSystemSession actually uses
      mockPoliciesService as any,
      mockStatusService as any,
      mockClusterService as any,
    );
  });

  it('should route to least-loaded edge using systemPrisma without consulting viewer count', async () => {
    const camera = { id: 'cam-1', orgId: 'org-1' };
    mockPrisma.camera.findUnique.mockResolvedValue(camera);
    mockPoliciesService.resolve.mockResolvedValue({
      ttlSeconds: 120,
      maxViewers: 0,
      domains: [],
      allowNoReferer: true,
    });
    mockPrisma.playbackSession.create.mockResolvedValue({
      id: 'sess-sys-1',
      orgId: 'org-1',
      cameraId: 'cam-1',
    });
    mockPrisma.playbackSession.update.mockImplementation(({ data }: any) => ({
      id: 'sess-sys-1',
      hlsUrl: data.hlsUrl,
      expiresAt: new Date(),
    }));
    mockClusterService.getLeastLoadedEdge.mockResolvedValue({
      id: 'edge-1',
      name: 'Edge 1',
      hlsUrl: 'http://edge1:8080',
      status: 'ONLINE',
    });

    const result = await playbackService.createSystemSession('cam-1', 'org-1');

    expect(result.sessionId).toBe('sess-sys-1');
    expect(result.hlsUrl).toContain('http://edge1:8080/live/org-1/cam-1.m3u8');
    expect(result.hlsUrl).toContain('token=mock-jwt-token');
    // Viewer-limit MUST be skipped for system callers — background snapshot
    // tasks are not user viewers.
    expect(mockStatusService.getViewerCount).not.toHaveBeenCalled();
    // Edge selection still happens — system caller must produce same hlsUrl
    // shape as createSession so on_play accepts it.
    expect(mockClusterService.getLeastLoadedEdge).toHaveBeenCalled();
  });

  it('should throw NotFoundException when camera.orgId does not match the requested orgId', async () => {
    mockPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam-x',
      orgId: 'org-OTHER',
    });

    await expect(
      playbackService.createSystemSession('cam-x', 'org-1'),
    ).rejects.toThrow(/not found/i);

    // Defense-in-depth: org mismatch must short-circuit BEFORE any session row
    // is written.
    expect(mockPrisma.playbackSession.create).not.toHaveBeenCalled();
  });
});

// Quick task 260501-vx5 (2026-05-01) removed the "Settings propagation" tests
// — they exercised SettingsService.regenerateAndReloadSrs() which was deleted
// alongside the SystemSettings model + /admin/settings/stream-engine endpoints.
// Edge nodes still pick up origin SRS reloads, but there's no longer an HTTP
// path that triggers `incrementConfigVersion` from the api side.
