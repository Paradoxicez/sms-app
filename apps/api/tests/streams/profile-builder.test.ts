import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateStreamProfileSchema } from '../../src/streams/dto/create-stream-profile.dto';
import { UpdateStreamProfileSchema } from '../../src/streams/dto/update-stream-profile.dto';

describe('CreateStreamProfileSchema', () => {
  it('should accept passthrough profile with codec=copy', () => {
    const result = CreateStreamProfileSchema.safeParse({
      name: 'Passthrough',
      codec: 'copy',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.codec).toBe('copy');
      expect(result.data.audioCodec).toBe('aac');
      expect(result.data.isDefault).toBe(false);
    }
  });

  it('should accept transcode profile with codec=libx264 and full settings', () => {
    const result = CreateStreamProfileSchema.safeParse({
      name: 'HD 720p',
      codec: 'libx264',
      preset: 'veryfast',
      resolution: '1280x720',
      fps: 30,
      videoBitrate: '2000k',
      audioCodec: 'aac',
      audioBitrate: '128k',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.codec).toBe('libx264');
      expect(result.data.resolution).toBe('1280x720');
      expect(result.data.fps).toBe(30);
      expect(result.data.videoBitrate).toBe('2000k');
    }
  });

  it('should reject invalid codec', () => {
    const result = CreateStreamProfileSchema.safeParse({
      name: 'Bad Profile',
      codec: 'h265',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid resolution format', () => {
    const result = CreateStreamProfileSchema.safeParse({
      name: 'Bad',
      resolution: 'fullhd',
    });
    expect(result.success).toBe(false);
  });

  it('should reject fps > 60', () => {
    const result = CreateStreamProfileSchema.safeParse({
      name: 'Too Fast',
      fps: 120,
    });
    expect(result.success).toBe(false);
  });

  it('should accept isDefault=true', () => {
    const result = CreateStreamProfileSchema.safeParse({
      name: 'Default Profile',
      isDefault: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isDefault).toBe(true);
    }
  });

  it('should default codec to auto', () => {
    const result = CreateStreamProfileSchema.safeParse({
      name: 'Auto Profile',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.codec).toBe('auto');
    }
  });
});

describe('UpdateStreamProfileSchema', () => {
  it('should accept partial updates', () => {
    const result = UpdateStreamProfileSchema.safeParse({
      name: 'Updated Name',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object', () => {
    const result = UpdateStreamProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('StreamProfileService', () => {
  // Mock Prisma tenancy client
  const mockStreamProfile = {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  };

  // Phase 21 Plan 05 (D-10): delete() now pre-checks `prisma.camera.findMany`
  // for referencing cameras and throws ConflictException(409) when any exist.
  // Default this mock to an empty array so the existing "should delete profile"
  // test continues to assert the no-references happy path.
  const mockCamera = {
    findMany: vi.fn().mockResolvedValue([]),
  };

  const mockTenancyClient = {
    streamProfile: mockStreamProfile,
    camera: mockCamera,
  };

  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Restore the no-references default after clearAllMocks (Phase 21 D-10).
    mockCamera.findMany.mockResolvedValue([]);

    // Dynamic import to allow module to exist
    const { StreamProfileService } = await import(
      '../../src/streams/stream-profile.service'
    );
    service = new StreamProfileService(mockTenancyClient as any);
  });

  it('should create a profile', async () => {
    const dto = { name: 'Test', codec: 'copy' as const, audioCodec: 'aac' as const };
    mockStreamProfile.create.mockResolvedValue({ id: '1', orgId: 'org-1', ...dto });

    const result = await service.create('org-1', dto);
    expect(result).toHaveProperty('id');
    expect(mockStreamProfile.create).toHaveBeenCalled();
  });

  it('should unset other defaults when creating with isDefault=true', async () => {
    const dto = { name: 'New Default', codec: 'auto' as const, isDefault: true, audioCodec: 'aac' as const };
    mockStreamProfile.updateMany.mockResolvedValue({ count: 1 });
    mockStreamProfile.create.mockResolvedValue({ id: '2', orgId: 'org-1', ...dto });

    await service.create('org-1', dto);
    expect(mockStreamProfile.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org-1', isDefault: true },
      data: { isDefault: false },
    });
  });

  it('should list all profiles for org (RLS-filtered)', async () => {
    mockStreamProfile.findMany.mockResolvedValue([
      { id: '1', name: 'Profile A' },
      { id: '2', name: 'Profile B' },
    ]);

    const result = await service.findAll();
    expect(result).toHaveLength(2);
    expect(mockStreamProfile.findMany).toHaveBeenCalled();
  });

  it('should find profile by id', async () => {
    mockStreamProfile.findUnique.mockResolvedValue({ id: '1', name: 'Profile A' });

    const result = await service.findById('1');
    expect(result).toHaveProperty('name', 'Profile A');
  });

  it('should update profile', async () => {
    mockStreamProfile.update.mockResolvedValue({ id: '1', name: 'Updated' });

    const result = await service.update('1', { name: 'Updated' });
    expect(result).toHaveProperty('name', 'Updated');
  });

  it('should unset other defaults when updating with isDefault=true', async () => {
    const existing = { id: '1', orgId: 'org-1', name: 'Profile', isDefault: false };
    mockStreamProfile.findUnique.mockResolvedValue(existing);
    mockStreamProfile.updateMany.mockResolvedValue({ count: 1 });
    mockStreamProfile.update.mockResolvedValue({ ...existing, isDefault: true });

    await service.update('1', { isDefault: true });
    expect(mockStreamProfile.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org-1', isDefault: true },
      data: { isDefault: false },
    });
  });

  it('should delete profile', async () => {
    mockStreamProfile.delete.mockResolvedValue({ id: '1' });

    await service.delete('1');
    expect(mockStreamProfile.delete).toHaveBeenCalledWith({ where: { id: '1' } });
  });

  it('should return warnings for high resolution profiles', () => {
    const warnings = service.validate({
      resolution: '3840x2160',
      videoBitrate: '10000k',
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w: string) => w.includes('resolution'))).toBe(true);
  });

  it('should return warnings for high bitrate', () => {
    const warnings = service.validate({
      videoBitrate: '12000k',
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w: string) => w.includes('bitrate'))).toBe(true);
  });

  it('should return no warnings for reasonable settings', () => {
    const warnings = service.validate({
      resolution: '1280x720',
      videoBitrate: '2000k',
    });
    expect(warnings).toHaveLength(0);
  });
});
