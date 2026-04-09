import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('SRS Config Generator', () => {
  let service: any;

  const mockPrisma = {
    systemSettings: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    orgSettings: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  };

  const mockSrsApiService = {
    reloadConfig: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { SettingsService } = await import(
      '../../src/settings/settings.service'
    );
    service = new SettingsService(mockPrisma as any, mockSrsApiService as any);
  });

  it('should generate valid srs.conf with default settings', () => {
    const config = service.generateSrsConfig({
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: false,
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985,
    });

    expect(config).toContain('listen              1935;');
    expect(config).toContain('hls_fragment    2;');
    expect(config).toContain('hls_window      10;');
    expect(config).toContain('hls_use_fmp4    on;');
    expect(config).toContain('hls_cleanup     on;');
    expect(config).toContain('hls_dispose     30;');
    expect(config).toContain('hls_wait_keyframe on;');
    expect(config).toContain('on_publish');
    expect(config).toContain('on_unpublish');
    expect(config).toContain('on_play');
    expect(config).toContain('on_stop');
    expect(config).toContain('on_hls');
    expect(config).toContain('on_dvr');
    expect(config).toContain('rtc {');
    expect(config).toContain('rtmp_to_rtc on;');
    expect(config).not.toContain('hls_keys');
  });

  it('should include hls_keys block when hlsEncryption=true', () => {
    const config = service.generateSrsConfig({
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: true,
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985,
    });

    expect(config).toContain('hls_keys        on;');
    expect(config).toContain('hls_fragments_per_key 10;');
    expect(config).toContain('hls_key_file');
    expect(config).toContain('hls_key_url');
  });

  it('should omit hls_keys block when hlsEncryption=false', () => {
    const config = service.generateSrsConfig({
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: false,
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985,
    });

    expect(config).not.toContain('hls_keys');
  });

  it('should use custom port values', () => {
    const config = service.generateSrsConfig({
      hlsFragment: 3,
      hlsWindow: 15,
      hlsEncryption: false,
      rtmpPort: 1936,
      httpPort: 8081,
      apiPort: 1986,
    });

    expect(config).toContain('listen              1936;');
    expect(config).toContain('listen          8081;');
    expect(config).toContain('listen          1986;');
    expect(config).toContain('hls_fragment    3;');
    expect(config).toContain('hls_window      15;');
  });

  it('should include all 6 HTTP callback URLs', () => {
    const config = service.generateSrsConfig({
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: false,
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985,
    });

    const callbacks = [
      'on-publish',
      'on-unpublish',
      'on-play',
      'on-stop',
      'on-hls',
      'on-dvr',
    ];
    for (const cb of callbacks) {
      expect(config).toContain(`http://api:3001/api/srs/callbacks/${cb}`);
    }
  });
});
