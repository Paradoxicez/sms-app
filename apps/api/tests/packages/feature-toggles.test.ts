import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization, createTestPackage } from '../helpers/tenancy';
import { PackagesService } from '../../src/packages/packages.service';
import { FeaturesService } from '../../src/features/features.service';

describe('Package Feature Toggles', () => {
  let service: PackagesService;

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    service = new PackagesService(testPrisma as any);
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('should create a package with features { recordings: true, webhooks: false }', async () => {
    const pkg = await service.create({
      name: 'Pro',
      maxCameras: 50,
      maxViewers: 200,
      maxBandwidthMbps: 500,
      maxStorageGb: 500,
      features: { recordings: true, webhooks: false },
    });

    const features = pkg.features as Record<string, boolean>;
    expect(features.recordings).toBe(true);
    expect(features.webhooks).toBe(false);
  });

  it('should merge features when updating without replacing entire object', async () => {
    const pkg = await service.create({
      name: 'Pro',
      maxCameras: 50,
      maxViewers: 200,
      maxBandwidthMbps: 500,
      maxStorageGb: 500,
      features: { recordings: true, webhooks: false },
    });

    const updated = await service.update(pkg.id, {
      features: { map: true },
    });

    const features = updated.features as Record<string, boolean>;
    expect(features.recordings).toBe(true); // preserved
    expect(features.webhooks).toBe(false); // preserved
    expect(features.map).toBe(true); // added
  });

  it('should default features to empty object when not provided', async () => {
    const pkg = await service.create({
      name: 'Minimal',
      maxCameras: 5,
      maxViewers: 10,
      maxBandwidthMbps: 50,
      maxStorageGb: 20,
    });

    const features = pkg.features as Record<string, boolean>;
    expect(features).toEqual({});
  });
});

describe('Feature Toggle Enforcement (SC-5 gap closure)', () => {
  let featuresService: FeaturesService;
  let testOrg: any;
  let testPackage: any;

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    featuresService = new FeaturesService(testPrisma as any);

    // Create package with specific features
    testPackage = await createTestPackage(testPrisma, {
      name: 'Pro Plan',
      features: { recordings: true, webhooks: true, map: false },
    });

    // Create org with this package
    testOrg = await createTestOrganization(testPrisma, {
      name: 'Test Corp',
      slug: 'test-corp',
      packageId: testPackage.id,
    });
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('checkFeature returns true for enabled feature', async () => {
    const result = await featuresService.checkFeature(testOrg.id, 'recordings');
    expect(result).toBe(true);
  });

  it('checkFeature returns false for disabled feature', async () => {
    const result = await featuresService.checkFeature(testOrg.id, 'map');
    expect(result).toBe(false);
  });

  it('checkFeature returns false for unknown feature', async () => {
    const result = await featuresService.checkFeature(testOrg.id, 'nonexistent');
    expect(result).toBe(false);
  });

  it('getOrgFeatures returns all features from package', async () => {
    const features = await featuresService.getOrgFeatures(testOrg.id);
    expect(features).toEqual({ recordings: true, webhooks: true, map: false });
  });

  it('getOrgFeatures returns empty object for org without package', async () => {
    const noPackageOrg = await createTestOrganization(testPrisma, {
      name: 'No Package Org',
      slug: 'no-package-org',
    });
    const features = await featuresService.getOrgFeatures(noPackageOrg.id);
    expect(features).toEqual({});
  });
});
