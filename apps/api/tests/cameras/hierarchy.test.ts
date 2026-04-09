import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from '../setup';
import { cleanupTestData, createTestOrganization, createTestPackage } from '../helpers/tenancy';
import { CamerasService } from '../../src/cameras/cameras.service';

describe('Camera Hierarchy (Project > Site > Camera)', () => {
  let service: CamerasService;
  let orgId: string;

  beforeEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);
    const org = await createTestOrganization(testPrisma);
    orgId = org.id;
    service = new CamerasService(testPrisma as any, testPrisma as any);
  });

  afterEach(async () => {
    await cleanupCameraData(testPrisma);
    await cleanupTestData(testPrisma);
  });

  it('should create a project with name and description', async () => {
    const project = await service.createProject(orgId, {
      name: 'Office Building',
      description: 'Main office',
    });

    expect(project.id).toBeDefined();
    expect(project.orgId).toBe(orgId);
    expect(project.name).toBe('Office Building');
    expect(project.description).toBe('Main office');
  });

  it('should create a site within a project', async () => {
    const project = await service.createProject(orgId, { name: 'Building A' });
    const site = await service.createSite(orgId, project.id, {
      name: 'Floor 1',
      description: 'Ground floor',
    });

    expect(site.id).toBeDefined();
    expect(site.orgId).toBe(orgId);
    expect(site.projectId).toBe(project.id);
    expect(site.name).toBe('Floor 1');
  });

  it('should reject site creation with invalid project ID', async () => {
    await expect(
      service.createSite(orgId, 'non-existent-id', { name: 'Floor 1' }),
    ).rejects.toThrow();
  });

  it('should list projects with site count', async () => {
    const project = await service.createProject(orgId, { name: 'P1' });
    await service.createSite(orgId, project.id, { name: 'S1' });
    await service.createSite(orgId, project.id, { name: 'S2' });

    const projects = await service.findAllProjects();
    const found = projects.find((p: any) => p.id === project.id);
    expect(found).toBeDefined();
    expect(found._count?.sites || found.sites?.length).toBe(2);
  });

  it('should delete project and cascade to sites and cameras', async () => {
    const project = await service.createProject(orgId, { name: 'ToDelete' });
    const site = await service.createSite(orgId, project.id, { name: 'S1' });
    await testPrisma.camera.create({
      data: {
        orgId,
        siteId: site.id,
        name: 'Cam1',
        streamUrl: 'rtsp://192.168.1.1/stream',
      },
    });

    await service.deleteProject(project.id);

    const sites = await testPrisma.site.findMany({ where: { projectId: project.id } });
    const cameras = await testPrisma.camera.findMany({ where: { siteId: site.id } });
    expect(sites).toHaveLength(0);
    expect(cameras).toHaveLength(0);
  });

  it('should find sites by project', async () => {
    const project = await service.createProject(orgId, { name: 'P1' });
    await service.createSite(orgId, project.id, { name: 'S1' });
    await service.createSite(orgId, project.id, { name: 'S2' });

    const sites = await service.findSitesByProject(project.id);
    expect(sites).toHaveLength(2);
  });

  it('should delete site and cascade to cameras', async () => {
    const project = await service.createProject(orgId, { name: 'P1' });
    const site = await service.createSite(orgId, project.id, { name: 'S1' });
    await testPrisma.camera.create({
      data: {
        orgId,
        siteId: site.id,
        name: 'Cam1',
        streamUrl: 'rtsp://192.168.1.1/stream',
      },
    });

    await service.deleteSite(site.id);

    const cameras = await testPrisma.camera.findMany({ where: { siteId: site.id } });
    expect(cameras).toHaveLength(0);
  });
});

async function cleanupCameraData(prisma: any) {
  await prisma.camera.deleteMany();
  await prisma.site.deleteMany();
  await prisma.project.deleteMany();
}
