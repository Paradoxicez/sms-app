import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData } from '../helpers/tenancy';
import { PackagesService } from '../../src/packages/packages.service';
import { CreatePackageSchema } from '../../src/packages/dto/create-package.dto';

describe('Package Limits', () => {
  let service: PackagesService;

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    service = new PackagesService(testPrisma as any);
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('should create a package with all limit fields', async () => {
    const pkg = await service.create({
      name: 'Enterprise',
      maxCameras: 100,
      maxViewers: 500,
      maxBandwidthMbps: 1000,
      maxStorageGb: 2000,
    });

    expect(pkg.id).toBeDefined();
    expect(pkg.name).toBe('Enterprise');
    expect(pkg.maxCameras).toBe(100);
    expect(pkg.maxViewers).toBe(500);
    expect(pkg.maxBandwidthMbps).toBe(1000);
    expect(pkg.maxStorageGb).toBe(2000);
    expect(pkg.isActive).toBe(true);
  });

  it('should reject maxCameras less than 1', () => {
    const result = CreatePackageSchema.safeParse({
      name: 'Bad',
      maxCameras: 0,
      maxViewers: 10,
      maxBandwidthMbps: 10,
      maxStorageGb: 10,
    });
    expect(result.success).toBe(false);
  });

  it('should update individual fields while preserving others', async () => {
    const pkg = await service.create({
      name: 'Basic',
      maxCameras: 10,
      maxViewers: 50,
      maxBandwidthMbps: 100,
      maxStorageGb: 50,
    });

    const updated = await service.update(pkg.id, { maxCameras: 20 });
    expect(updated.maxCameras).toBe(20);
    expect(updated.maxViewers).toBe(50); // preserved
    expect(updated.name).toBe('Basic'); // preserved
  });

  it('should deactivate a package by setting isActive to false', async () => {
    const pkg = await service.create({
      name: 'ToDelete',
      maxCameras: 5,
      maxViewers: 10,
      maxBandwidthMbps: 50,
      maxStorageGb: 20,
    });

    const deactivated = await service.deactivate(pkg.id);
    expect(deactivated.isActive).toBe(false);
  });

  it('findAll returns every package (admin view); deactivate flips isActive', async () => {
    const pkg1 = await service.create({
      name: 'Active',
      maxCameras: 10,
      maxViewers: 50,
      maxBandwidthMbps: 100,
      maxStorageGb: 50,
    });
    const pkg2 = await service.create({
      name: 'Inactive',
      maxCameras: 5,
      maxViewers: 10,
      maxBandwidthMbps: 50,
      maxStorageGb: 20,
    });
    await service.deactivate(pkg2.id);

    const all = await service.findAll();
    expect(all.some((p) => p.name === 'Active' && p.isActive)).toBe(true);
    expect(all.some((p) => p.name === 'Inactive' && p.isActive === false)).toBe(true);
  });
});
