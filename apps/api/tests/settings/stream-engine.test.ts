import { describe, it, expect, vi, beforeEach } from 'vitest';

import { UpdateOrgSettingsSchema } from '../../src/settings/dto/update-org-settings.dto';

// Quick task 260501-vx5 (2026-05-01) dropped the SystemSettings model + the
// /admin/settings/stream-engine endpoints. The previous SystemSettingsSchema +
// SettingsService.getSystemSettings/updateSystemSettings/generateSrsConfig
// tests were removed alongside the source they covered. The Org Settings path
// is the only surviving consumer of SettingsService.

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

describe('SettingsService (org-only post-vx5)', () => {
  const mockOrgSettings = {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  };

  const mockPrisma = {
    orgSettings: mockOrgSettings,
  };

  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { SettingsService } = await import(
      '../../src/settings/settings.service'
    );
    service = new SettingsService(mockPrisma as any);
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
