import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ClusterService', () => {
  let service: any;

  const mockPrisma = {
    srsNode: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
  };

  const mockSrsApiService = {
    getVersions: vi.fn(),
    getSummaries: vi.fn(),
    reloadConfig: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { ClusterService } = await import(
      '../../src/cluster/cluster.service'
    );
    service = new ClusterService(mockPrisma as any, mockSrsApiService as any);
  });

  describe('create', () => {
    it('should create an edge node with CONNECTING status', async () => {
      const dto = {
        name: 'Edge 1',
        apiUrl: 'http://edge1:1985',
        hlsUrl: 'http://edge1:8080',
      };
      const expectedNode = {
        id: 'uuid-1',
        ...dto,
        role: 'EDGE',
        status: 'CONNECTING',
        hlsPort: 8080,
        isLocal: true,
      };
      mockSrsApiService.getVersions.mockResolvedValue({ code: 0, server: 'srs' });
      // Edge testConnection does `fetch(hlsUrl/health)`; mock it to succeed so
      // the service writes status=CONNECTING (not OFFLINE).
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as any);
      mockPrisma.srsNode.create.mockResolvedValue(expectedNode);

      const result = await service.create(dto);
      globalThis.fetch = originalFetch;

      expect(result).toEqual(expectedNode);
      expect(mockPrisma.srsNode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          role: 'EDGE',
          status: 'CONNECTING',
        }),
      });
    });
  });

  describe('findAll', () => {
    it('should return all nodes ordered by role then name', async () => {
      const nodes = [
        { id: '1', name: 'Origin', role: 'ORIGIN' },
        { id: '2', name: 'Edge A', role: 'EDGE' },
      ];
      mockPrisma.srsNode.findMany.mockResolvedValue(nodes);

      const result = await service.findAll();

      expect(result).toEqual(nodes);
      expect(mockPrisma.srsNode.findMany).toHaveBeenCalledWith({
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      });
    });
  });

  describe('findOne', () => {
    it('should return node by id', async () => {
      const node = { id: '1', name: 'Origin', role: 'ORIGIN' };
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);

      const result = await service.findOne('1');

      expect(result).toEqual(node);
    });

    it('should throw NotFoundException if node not found', async () => {
      mockPrisma.srsNode.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update node fields', async () => {
      const updated = { id: '1', name: 'Updated Edge', role: 'EDGE' };
      mockPrisma.srsNode.findUnique.mockResolvedValue({ id: '1', role: 'EDGE' });
      mockPrisma.srsNode.update.mockResolvedValue(updated);

      const result = await service.update('1', { name: 'Updated Edge' });

      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should delete edge node', async () => {
      mockPrisma.srsNode.findUnique.mockResolvedValue({
        id: '1',
        role: 'EDGE',
      });
      mockPrisma.srsNode.delete.mockResolvedValue({ id: '1' });

      await service.remove('1');

      expect(mockPrisma.srsNode.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should reject deletion of origin node', async () => {
      mockPrisma.srsNode.findUnique.mockResolvedValue({
        id: '1',
        role: 'ORIGIN',
      });

      await expect(service.remove('1')).rejects.toThrow();
    });
  });

  describe('onModuleInit', () => {
    it('should create origin if none exists', async () => {
      mockPrisma.srsNode.findFirst.mockResolvedValue(null);
      mockPrisma.srsNode.create.mockResolvedValue({ id: '1', role: 'ORIGIN' });

      await service.onModuleInit();

      expect(mockPrisma.srsNode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Primary Origin',
          role: 'ORIGIN',
          status: 'ONLINE',
          isLocal: true,
        }),
      });
    });

    it('should skip if origin already exists', async () => {
      mockPrisma.srsNode.findFirst.mockResolvedValue({ id: '1', role: 'ORIGIN' });

      await service.onModuleInit();

      expect(mockPrisma.srsNode.create).not.toHaveBeenCalled();
    });
  });

  describe('SrsApiService multi-node', () => {
    it('should call getSummaries with custom nodeApiUrl', async () => {
      mockSrsApiService.getSummaries.mockResolvedValue({ code: 0 });

      await mockSrsApiService.getSummaries('http://custom:1985');

      expect(mockSrsApiService.getSummaries).toHaveBeenCalledWith('http://custom:1985');
    });

    it('should call reloadConfig with custom nodeApiUrl', async () => {
      mockSrsApiService.reloadConfig.mockResolvedValue(undefined);

      await mockSrsApiService.reloadConfig('http://custom:1985');

      expect(mockSrsApiService.reloadConfig).toHaveBeenCalledWith('http://custom:1985');
    });
  });

  describe('getLeastLoadedEdge', () => {
    it('should return the edge with lowest viewers', async () => {
      const edges = [
        { id: '1', role: 'EDGE', status: 'ONLINE', viewers: 10 },
        { id: '2', role: 'EDGE', status: 'ONLINE', viewers: 3 },
        { id: '3', role: 'EDGE', status: 'ONLINE', viewers: 7 },
      ];
      mockPrisma.srsNode.findFirst.mockResolvedValue(edges[1]);

      const result = await service.getLeastLoadedEdge();

      expect(result).toEqual(edges[1]);
      expect(mockPrisma.srsNode.findFirst).toHaveBeenCalledWith({
        where: { role: 'EDGE', status: 'ONLINE' },
        orderBy: { viewers: 'asc' },
      });
    });
  });
});
