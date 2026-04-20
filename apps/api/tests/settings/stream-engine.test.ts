import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
}));

import { writeFileSync } from 'fs';
import { UpdateSystemSettingsSchema } from '../../src/settings/dto/update-system-settings.dto';
import { UpdateOrgSettingsSchema } from '../../src/settings/dto/update-org-settings.dto';

describe('UpdateSystemSettingsSchema', () => {
  it('should accept valid system settings update', () => {
    const result = UpdateSystemSettingsSchema.safeParse({
      hlsFragment: 3,
      hlsWindow: 15,
      hlsEncryption: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject hlsFragment < 1', () => {
    const result = UpdateSystemSettingsSchema.safeParse({ hlsFragment: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject hlsFragment > 10', () => {
    const result = UpdateSystemSettingsSchema.safeParse({ hlsFragment: 11 });
    expect(result.success).toBe(false);
  });

  it('should reject hlsWindow < 5', () => {
    const result = UpdateSystemSettingsSchema.safeParse({ hlsWindow: 4 });
    expect(result.success).toBe(false);
  });

  it('should reject port < 1024', () => {
    const result = UpdateSystemSettingsSchema.safeParse({ rtmpPort: 80 });
    expect(result.success).toBe(false);
  });

  it('should reject port > 65535', () => {
    const result = UpdateSystemSettingsSchema.safeParse({ rtmpPort: 70000 });
    expect(result.success).toBe(false);
  });

  it('should reject timeoutSeconds < 5', () => {
    const result = UpdateSystemSettingsSchema.safeParse({ timeoutSeconds: 1 });
    expect(result.success).toBe(false);
  });

  it('should accept empty object', () => {
    const result = UpdateSystemSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('UpdateOrgSettingsSchema', () => {
  it('accepts valid defaultRetentionDays', () => {
    const result = UpdateOrgSettingsSchema.safeParse({ defaultRetentionDays: 90 });
    expect(result.success).toBe(true);
  });

  it('rejects retention below 1 day', () => {
    const result = UpdateOrgSettingsSchema.safeParse({ defaultRetentionDays: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects retention above 10 years', () => {
    const result = UpdateOrgSettingsSchema.safeParse({ defaultRetentionDays: 3651 });
    expect(result.success).toBe(false);
  });

  it('accepts empty object (partial update)', () => {
    const result = UpdateOrgSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('SettingsService', () => {
  const mockSystemSettings = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const mockOrgSettings = {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  };

  const mockPrisma = {
    systemSettings: mockSystemSettings,
    orgSettings: mockOrgSettings,
  };

  const mockSrsApiService = {
    reloadConfig: vi.fn(),
  };

  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { SettingsService } = await import(
      '../../src/settings/settings.service'
    );
    // After 260420-oid: dual-injection. systemPrisma reuses the same mock so
    // both boot path (systemPrisma.systemSettings.findFirst/create) and HTTP
    // path (tenantPrisma.systemSettings.findFirst/create) hit the same vi.fn().
    service = new SettingsService(
      mockPrisma as any,
      mockPrisma as any,
      mockSrsApiService as any,
      { getOnlineEdges: vi.fn().mockResolvedValue([]), incrementConfigVersion: vi.fn() } as any,
    );
  });

  it('should return defaults when no system settings row exists (auto-creates)', async () => {
    mockSystemSettings.findFirst.mockResolvedValue(null);
    mockSystemSettings.create.mockResolvedValue({
      id: '1',
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: false,
      rtmpPort: 1935,
      srtPort: 10080,
      webrtcPort: 8000,
      httpPort: 8080,
      apiPort: 1985,
      timeoutSeconds: 30,
    });

    const result = await service.getSystemSettings();
    expect(result).toHaveProperty('hlsFragment', 2);
    expect(mockSystemSettings.create).toHaveBeenCalled();
  });

  it('should update system settings and trigger srs.conf regeneration', async () => {
    const existing = {
      id: '1',
      hlsFragment: 2,
      hlsWindow: 10,
      hlsEncryption: false,
      rtmpPort: 1935,
      srtPort: 10080,
      webrtcPort: 8000,
      httpPort: 8080,
      apiPort: 1985,
      timeoutSeconds: 30,
    };
    mockSystemSettings.findFirst.mockResolvedValue(existing);
    mockSystemSettings.update.mockResolvedValue({
      ...existing,
      hlsFragment: 3,
      hlsWindow: 15,
    });

    const result = await service.updateSystemSettings({
      hlsFragment: 3,
      hlsWindow: 15,
    });

    expect(result.hlsFragment).toBe(3);
    expect(writeFileSync).toHaveBeenCalled();
    expect(mockSrsApiService.reloadConfig).toHaveBeenCalled();
  });

  it('should get org settings (returns defaults when no row)', async () => {
    mockOrgSettings.findUnique.mockResolvedValue(null);
    mockOrgSettings.create.mockResolvedValue({
      id: '1',
      orgId: 'org-1',
      defaultRetentionDays: 30,
    });

    const result = await service.getOrgSettings('org-1');
    expect(result).toHaveProperty('defaultRetentionDays', 30);
    expect(mockOrgSettings.create).toHaveBeenCalled();
  });

  it('should update org settings via upsert', async () => {
    mockOrgSettings.upsert.mockResolvedValue({
      orgId: 'org-1',
      defaultRetentionDays: 60,
    });

    const result = await service.updateOrgSettings('org-1', {
      defaultRetentionDays: 60,
    });

    expect(result.defaultRetentionDays).toBe(60);
  });
});
