import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestPackage } from '../helpers/tenancy';
import { OrganizationsService } from '../../src/organizations/organizations.service';

describe('Organization Management', () => {
  let service: OrganizationsService;

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    service = new OrganizationsService(testPrisma as any);
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  it('should create an organization with a valid slug', async () => {
    const org = await service.create({
      name: 'Acme Corp',
      slug: 'acme-corp',
    });

    expect(org.id).toBeDefined();
    expect(org.name).toBe('Acme Corp');
    expect(org.slug).toBe('acme-corp');
    expect(org.isActive).toBe(true);
  });

  it('should assign a package to an organization', async () => {
    const pkg = await createTestPackage(testPrisma, { name: 'Enterprise' });
    const org = await service.create({
      name: 'Acme Corp',
      slug: 'acme-corp',
      packageId: pkg.id,
    });

    expect(org.packageId).toBe(pkg.id);

    // Also test reassignment
    const pkg2 = await createTestPackage(testPrisma, { name: 'Basic' });
    const updated = await service.assignPackage(org.id, pkg2.id);
    expect(updated.packageId).toBe(pkg2.id);
  });

  it('should deactivate an organization', async () => {
    const org = await service.create({
      name: 'To Deactivate',
      slug: 'to-deactivate',
    });

    const deactivated = await service.deactivate(org.id);
    expect(deactivated.isActive).toBe(false);
  });

  it('should not deactivate the system organization', async () => {
    // Create system org
    await testPrisma.organization.create({
      data: {
        id: 'system-org-id',
        name: 'System',
        slug: 'system',
      },
    });

    await expect(service.deactivate('system-org-id')).rejects.toThrow(
      'Cannot deactivate the System organization',
    );
  });

  it('should list organizations excluding system org', async () => {
    await testPrisma.organization.create({
      data: { id: 'system-org-id', name: 'System', slug: 'system' },
    });
    await service.create({ name: 'Customer A', slug: 'customer-a' });
    await service.create({ name: 'Customer B', slug: 'customer-b' });

    const orgs = await service.findAll();
    expect(orgs.length).toBe(2);
    expect(orgs.every((o) => o.slug !== 'system')).toBe(true);
  });

  it('should find an organization by id with package and member count', async () => {
    const pkg = await createTestPackage(testPrisma, { name: 'Pro' });
    const org = await service.create({
      name: 'Detail Org',
      slug: 'detail-org',
      packageId: pkg.id,
    });

    const found = await service.findOne(org.id);
    expect(found.name).toBe('Detail Org');
    expect(found.package).toBeDefined();
    expect(found._count.members).toBe(0);
  });
});
