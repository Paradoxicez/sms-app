import { describe, it, expect } from 'vitest';

describe('Config Generation', () => {
  describe('generateEdgeNginxConfig', () => {
    let generateEdgeNginxConfig: (originHlsUrl: string, listenPort: number) => string;

    beforeAll(async () => {
      const mod = await import('../../src/cluster/templates/nginx-edge.conf');
      generateEdgeNginxConfig = mod.generateEdgeNginxConfig;
    });

    it('should contain proxy_cache_path', () => {
      const config = generateEdgeNginxConfig('http://srs:8080', 8080);
      expect(config).toContain('proxy_cache_path /tmp/nginx-cache');
    });

    it('should contain health endpoint', () => {
      const config = generateEdgeNginxConfig('http://srs:8080', 8080);
      expect(config).toContain('location /health');
    });

    it('should contain stub_status', () => {
      const config = generateEdgeNginxConfig('http://srs:8080', 8080);
      expect(config).toContain('stub_status on');
    });

    it('should contain m3u8 caching with 10s validity', () => {
      const config = generateEdgeNginxConfig('http://srs:8080', 8080);
      expect(config).toContain('m3u8');
      expect(config).toContain('proxy_cache_valid 200 302 10s');
    });

    it('should contain segment location matching .ts, .m4s, and .mp4', () => {
      const config = generateEdgeNginxConfig('http://srs:8080', 8080);
      expect(config).toContain('ts|m4s|mp4');
    });

    it('should contain proxy_cache_lock on', () => {
      const config = generateEdgeNginxConfig('http://srs:8080', 8080);
      expect(config).toContain('proxy_cache_lock on');
    });

    it('should contain key passthrough with proxy_cache off', () => {
      const config = generateEdgeNginxConfig('http://srs:8080', 8080);
      expect(config).toContain('.key');
      expect(config).toContain('proxy_cache off');
    });

    it('should interpolate originHlsUrl and listenPort correctly', () => {
      const config = generateEdgeNginxConfig('http://custom-origin:9090', 3000);
      expect(config).toContain('listen 3000');
      expect(config).toContain('http://custom-origin:9090');
    });

    it('should contain segment caching with 60m validity', () => {
      const config = generateEdgeNginxConfig('http://srs:8080', 8080);
      expect(config).toContain('proxy_cache_valid 200 302 60m');
    });
  });
});
