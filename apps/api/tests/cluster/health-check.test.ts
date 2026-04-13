import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ClusterHealthService', () => {
  let service: any;

  const mockPrisma = {
    srsNode: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const mockSrsApiService = {
    getSummaries: vi.fn(),
    getClients: vi.fn(),
    getVersions: vi.fn(),
  };

  const mockGateway = {
    broadcastNodeHealth: vi.fn(),
    broadcastNodeStatus: vi.fn(),
  };

  const mockHealthQueue = {
    add: vi.fn(),
    removeRepeatable: vi.fn(),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
  };

  const createNode = (overrides: any = {}) => ({
    id: 'node-1',
    name: 'Test Node',
    role: 'ORIGIN',
    status: 'ONLINE',
    apiUrl: 'http://srs:1985',
    hlsUrl: 'http://srs:8080',
    cpu: null,
    memory: null,
    bandwidth: BigInt(0),
    viewers: 0,
    srsVersion: null,
    uptime: null,
    missedChecks: 0,
    lastHealthAt: null,
    configVersion: 0,
    isLocal: true,
    metadata: null,
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock global fetch for edge node checks
    vi.stubGlobal('fetch', vi.fn());

    const { ClusterHealthService } = await import(
      '../../src/cluster/cluster-health.service'
    );
    service = new ClusterHealthService(
      mockPrisma as any,
      mockSrsApiService as any,
      mockGateway as any,
      mockHealthQueue as any,
    );
  });

  describe('checkNode - ORIGIN success', () => {
    it('should update metrics from SRS summaries on success', async () => {
      const node = createNode({ role: 'ORIGIN', status: 'ONLINE', missedChecks: 0 });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue({ ...node, cpu: 25.5, memory: 40.2 });

      mockSrsApiService.getSummaries.mockResolvedValue({
        data: {
          self: {
            cpu_percent: 25.5,
            mem_percent: 40.2,
            srs_bytes_sent_total: 1024000,
            srs_uptime: 3600,
          },
        },
      });
      mockSrsApiService.getClients.mockResolvedValue({
        clients: [{ id: 1 }, { id: 2 }],
      });
      mockSrsApiService.getVersions.mockResolvedValue({
        data: { version: '6.0.184' },
      });

      await service.checkNode('node-1');

      expect(mockSrsApiService.getSummaries).toHaveBeenCalledWith('http://srs:1985');
      expect(mockPrisma.srsNode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'node-1' },
          data: expect.objectContaining({
            cpu: 25.5,
            memory: 40.2,
            bandwidth: BigInt(1024000),
            viewers: 2,
            uptime: 3600,
            srsVersion: '6.0.184',
            missedChecks: 0,
          }),
        }),
      );
    });

    it('should reset missedChecks to 0 and set lastHealthAt on success', async () => {
      const node = createNode({ role: 'ORIGIN', missedChecks: 2, status: 'DEGRADED' });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue({ ...node, missedChecks: 0, status: 'ONLINE' });

      mockSrsApiService.getSummaries.mockResolvedValue({
        data: { self: { cpu_percent: 10, mem_percent: 20, srs_bytes_sent_total: 0, srs_uptime: 100 } },
      });
      mockSrsApiService.getClients.mockResolvedValue({ clients: [] });
      mockSrsApiService.getVersions.mockResolvedValue({ data: { version: '6.0.184' } });

      await service.checkNode('node-1');

      const updateCall = mockPrisma.srsNode.update.mock.calls[0][0];
      expect(updateCall.data.missedChecks).toBe(0);
      expect(updateCall.data.lastHealthAt).toBeInstanceOf(Date);
    });
  });

  describe('checkNode - EDGE success', () => {
    it('should check edge health via fetch and parse nginx_status', async () => {
      const node = createNode({
        id: 'edge-1',
        role: 'EDGE',
        status: 'ONLINE',
        hlsUrl: 'http://edge1:8080',
      });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue({ ...node });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true }) // /health
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('Active connections: 15\nserver accepts handled requests\n 50 50 100\nReading: 0 Writing: 1 Waiting: 14\n'),
        }); // /nginx_status
      vi.stubGlobal('fetch', fetchMock);

      await service.checkNode('edge-1');

      expect(fetchMock).toHaveBeenCalledWith('http://edge1:8080/health', expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith('http://edge1:8080/nginx_status', expect.any(Object));

      const updateCall = mockPrisma.srsNode.update.mock.calls[0][0];
      expect(updateCall.data.viewers).toBe(15);
      expect(updateCall.data.missedChecks).toBe(0);
    });
  });

  describe('checkNode - failure path', () => {
    it('should increment missedChecks on failure', async () => {
      const node = createNode({ role: 'ORIGIN', missedChecks: 0, status: 'ONLINE' });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue({ ...node, missedChecks: 1 });

      mockSrsApiService.getSummaries.mockRejectedValue(new Error('Connection refused'));

      await service.checkNode('node-1');

      const updateCall = mockPrisma.srsNode.update.mock.calls[0][0];
      expect(updateCall.data.missedChecks).toBe(1);
    });

    it('should set status DEGRADED when missedChecks is 1-2', async () => {
      const node = createNode({ role: 'ORIGIN', missedChecks: 1, status: 'ONLINE' });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue({ ...node, missedChecks: 2, status: 'DEGRADED' });

      mockSrsApiService.getSummaries.mockRejectedValue(new Error('timeout'));

      await service.checkNode('node-1');

      const updateCall = mockPrisma.srsNode.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('DEGRADED');
    });

    it('should set status OFFLINE when missedChecks reaches 3', async () => {
      const node = createNode({ role: 'ORIGIN', missedChecks: 2, status: 'DEGRADED' });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue({ ...node, missedChecks: 3, status: 'OFFLINE' });

      mockSrsApiService.getSummaries.mockRejectedValue(new Error('timeout'));

      await service.checkNode('node-1');

      const updateCall = mockPrisma.srsNode.update.mock.calls[0][0];
      expect(updateCall.data.missedChecks).toBe(3);
      expect(updateCall.data.status).toBe('OFFLINE');
    });
  });

  describe('checkNode - auto-recovery', () => {
    it('should set status ONLINE when previously OFFLINE node passes check', async () => {
      const node = createNode({ role: 'ORIGIN', missedChecks: 5, status: 'OFFLINE' });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue({ ...node, missedChecks: 0, status: 'ONLINE' });

      mockSrsApiService.getSummaries.mockResolvedValue({
        data: { self: { cpu_percent: 5, mem_percent: 10, srs_bytes_sent_total: 0, srs_uptime: 50 } },
      });
      mockSrsApiService.getClients.mockResolvedValue({ clients: [] });
      mockSrsApiService.getVersions.mockResolvedValue({ data: { version: '6.0.184' } });

      await service.checkNode('node-1');

      const updateCall = mockPrisma.srsNode.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('ONLINE');
      expect(updateCall.data.missedChecks).toBe(0);
    });

    it('should set status ONLINE when previously DEGRADED node passes check', async () => {
      const node = createNode({ role: 'ORIGIN', missedChecks: 2, status: 'DEGRADED' });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue({ ...node, missedChecks: 0, status: 'ONLINE' });

      mockSrsApiService.getSummaries.mockResolvedValue({
        data: { self: { cpu_percent: 5, mem_percent: 10, srs_bytes_sent_total: 0, srs_uptime: 50 } },
      });
      mockSrsApiService.getClients.mockResolvedValue({ clients: [] });
      mockSrsApiService.getVersions.mockResolvedValue({ data: { version: '6.0.184' } });

      await service.checkNode('node-1');

      const updateCall = mockPrisma.srsNode.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('ONLINE');
    });
  });

  describe('checkNode - gateway broadcasts', () => {
    it('should broadcast node:health on every successful check', async () => {
      const node = createNode({ role: 'ORIGIN', status: 'ONLINE' });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue(node);

      mockSrsApiService.getSummaries.mockResolvedValue({
        data: { self: { cpu_percent: 30, mem_percent: 50, srs_bytes_sent_total: 2048, srs_uptime: 500 } },
      });
      mockSrsApiService.getClients.mockResolvedValue({ clients: [{ id: 1 }] });
      mockSrsApiService.getVersions.mockResolvedValue({ data: { version: '6.0.184' } });

      await service.checkNode('node-1');

      expect(mockGateway.broadcastNodeHealth).toHaveBeenCalledWith('node-1', expect.objectContaining({
        status: 'ONLINE',
        cpu: 30,
        memory: 50,
        viewers: 1,
      }));
    });

    it('should broadcast node:status only when status changes', async () => {
      // Node was ONLINE and stays ONLINE -- no status broadcast
      const node = createNode({ role: 'ORIGIN', status: 'ONLINE', missedChecks: 0 });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue(node);

      mockSrsApiService.getSummaries.mockResolvedValue({
        data: { self: { cpu_percent: 10, mem_percent: 20, srs_bytes_sent_total: 0, srs_uptime: 100 } },
      });
      mockSrsApiService.getClients.mockResolvedValue({ clients: [] });
      mockSrsApiService.getVersions.mockResolvedValue({ data: { version: '6.0.184' } });

      await service.checkNode('node-1');

      expect(mockGateway.broadcastNodeStatus).not.toHaveBeenCalled();
    });

    it('should broadcast node:status when status changes from DEGRADED to ONLINE', async () => {
      const node = createNode({ role: 'ORIGIN', status: 'DEGRADED', missedChecks: 1 });
      mockPrisma.srsNode.findUnique.mockResolvedValue(node);
      mockPrisma.srsNode.update.mockResolvedValue({ ...node, status: 'ONLINE', missedChecks: 0 });

      mockSrsApiService.getSummaries.mockResolvedValue({
        data: { self: { cpu_percent: 5, mem_percent: 10, srs_bytes_sent_total: 0, srs_uptime: 100 } },
      });
      mockSrsApiService.getClients.mockResolvedValue({ clients: [] });
      mockSrsApiService.getVersions.mockResolvedValue({ data: { version: '6.0.184' } });

      await service.checkNode('node-1');

      expect(mockGateway.broadcastNodeStatus).toHaveBeenCalledWith('node-1', 'ONLINE');
    });
  });

  describe('startHealthChecks', () => {
    it('should add repeatable job for each node', async () => {
      mockPrisma.srsNode.findMany.mockResolvedValue([
        createNode({ id: 'n1' }),
        createNode({ id: 'n2' }),
      ]);

      await service.startHealthChecks();

      expect(mockHealthQueue.add).toHaveBeenCalledTimes(2);
      expect(mockHealthQueue.add).toHaveBeenCalledWith(
        'health-n1',
        { nodeId: 'n1' },
        expect.objectContaining({
          repeat: { every: 10000 },
        }),
      );
    });
  });

  describe('addHealthCheck', () => {
    it('should add a repeatable job for a specific node', async () => {
      await service.addHealthCheck('new-node');

      expect(mockHealthQueue.add).toHaveBeenCalledWith(
        'health-new-node',
        { nodeId: 'new-node' },
        expect.objectContaining({
          repeat: { every: 10000 },
        }),
      );
    });
  });

  describe('removeHealthCheck', () => {
    it('should remove repeatable job for a specific node', async () => {
      mockHealthQueue.getRepeatableJobs.mockResolvedValue([
        { name: 'health-old-node', key: 'health-old-node:::10000', id: undefined, every: '10000' },
      ]);

      await service.removeHealthCheck('old-node');

      expect(mockHealthQueue.removeRepeatable).toHaveBeenCalledWith(
        'health-old-node',
        { every: 10000 },
      );
    });
  });
});
