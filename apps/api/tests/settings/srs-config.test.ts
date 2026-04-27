// Phase 23 DEBT-03 cold-boot regression lock for SettingsService.generateSrsConfig.
//
// SRS v6 rejects `hls_use_fmp4` (v7+ feature) and crashes on cold-boot when the
// directive is present. memory:project_srs_v6_limits records the prior incident.
// This test locks the absence of the directive in the SettingsService emit path
// (sibling test in tests/cluster/config-generation.test.ts covers the cluster
// origin template emit path).
//
// Implementation note: `SettingsService.generateSrsConfig(settings)` is a
// synchronous, pure function over a plain `SystemSettingsConfig` object — it
// does NOT touch tenantPrisma / systemPrisma / srsApiService / clusterService.
// We can therefore construct the service with dummy deps and call the method
// directly. No Nest TestingModule, no Prisma mocking required.

import { describe, it, expect, beforeAll } from 'vitest';
import { SettingsService } from '../../src/settings/settings.service';

describe('SettingsService.generateSrsConfig — Phase 23 DEBT-03 cold-boot regression lock', () => {
  let service: SettingsService;

  beforeAll(() => {
    // generateSrsConfig is synchronous and pure (no DB / no SRS API calls);
    // injected dependencies are not exercised by this test.
    service = new SettingsService(
      null as any, // tenantPrisma (TENANCY_CLIENT)
      null as any, // systemPrisma
      null as any, // srsApiService
      null as any, // clusterService
    );
  });

  it('does NOT contain hls_use_fmp4 directive (SRS v6 rejects this; v7+ only)', () => {
    const cfg = (service as any).generateSrsConfig({
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: false,
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985,
    });
    expect(cfg).not.toContain('hls_use_fmp4');
  });

  it('does NOT contain hls_use_fmp4 with HLS encryption enabled (verify branch coverage)', () => {
    const cfg = (service as any).generateSrsConfig({
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: true,
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985,
    });
    expect(cfg).not.toContain('hls_use_fmp4');
  });
});
