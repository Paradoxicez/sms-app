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

describe('Settings propagation', () => {
  let settingsService: any;

  const mockPrisma = {
    systemSettings: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    orgSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };

  const mockSrsApiService = {
    reloadConfig: vi.fn(),
  };

  const mockClusterService = {
    getOnlineEdges: vi.fn(),
    incrementConfigVersion: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock fs.writeFileSync to prevent actual file writes
    vi.doMock('fs', () => ({
      writeFileSync: vi.fn(),
    }));

    const { SettingsService } = await import(
      '../../src/settings/settings.service'
    );
    settingsService = new SettingsService(
      mockPrisma as any,
      mockSrsApiService as any,
      mockClusterService as any,
    );
  });

  it('should call incrementConfigVersion after reloading SRS', async () => {
    mockPrisma.systemSettings.findFirst.mockResolvedValue({
      id: 'settings-1',
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: false,
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985,
    });
    mockSrsApiService.reloadConfig.mockResolvedValue(undefined);
    mockClusterService.getOnlineEdges.mockResolvedValue([
      { id: 'edge-1', name: 'Edge 1' },
    ]);
    mockClusterService.incrementConfigVersion.mockResolvedValue(undefined);

    await settingsService.regenerateAndReloadSrs();

    expect(mockSrsApiService.reloadConfig).toHaveBeenCalled();
    expect(mockClusterService.getOnlineEdges).toHaveBeenCalled();
    expect(mockClusterService.incrementConfigVersion).toHaveBeenCalled();
  });

  it('should continue if one node reload fails', async () => {
    mockPrisma.systemSettings.findFirst.mockResolvedValue({
      id: 'settings-1',
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: false,
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985,
    });
    mockSrsApiService.reloadConfig.mockRejectedValue(new Error('SRS down'));
    mockClusterService.getOnlineEdges.mockResolvedValue([]);
    mockClusterService.incrementConfigVersion.mockResolvedValue(undefined);

    // Should not throw
    await settingsService.regenerateAndReloadSrs();

    expect(mockClusterService.incrementConfigVersion).toHaveBeenCalled();
  });
});
