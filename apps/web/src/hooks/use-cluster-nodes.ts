'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiFetch } from '@/lib/api';

export interface SrsNode {
  id: string;
  name: string;
  role: 'ORIGIN' | 'EDGE';
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'CONNECTING';
  apiUrl: string;
  hlsUrl: string;
  hlsPort: number;
  cpu: number | null;
  memory: number | null;
  bandwidth: string;
  viewers: number;
  srsVersion: string | null;
  uptime: number | null;
  missedChecks: number;
  lastHealthAt: string | null;
  configVersion: number;
  isLocal: boolean;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

interface NodeHealthEvent {
  nodeId: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'CONNECTING';
  cpu: number;
  memory: number;
  bandwidth: string;
  viewers: number;
}

interface NodeStatusEvent {
  nodeId: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'CONNECTING';
}

export interface ClusterStats {
  totalNodes: number;
  onlineNodes: number;
  totalViewers: number;
  totalBandwidth: number;
}

function parseBandwidth(bw: string | number | null | undefined): number {
  if (bw == null) return 0;
  if (typeof bw === 'number') return bw;
  const n = Number(bw);
  return isNaN(n) ? 0 : n;
}

export function useClusterNodes() {
  const [nodes, setNodes] = useState<SrsNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const fetchNodes = useCallback(async () => {
    try {
      setError(null);
      const data = await apiFetch<SrsNode[]>('/api/cluster/nodes');
      setNodes(data);
    } catch {
      setError('Unable to load cluster nodes. Check your connection and try refreshing the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  // Socket.IO real-time updates
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

    const socket = io(`${apiUrl}/cluster-status`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('node:health', (event: NodeHealthEvent) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === event.nodeId
            ? {
                ...node,
                status: event.status,
                cpu: event.cpu,
                memory: event.memory,
                bandwidth: event.bandwidth,
                viewers: event.viewers,
              }
            : node,
        ),
      );
    });

    socket.on('node:status', (event: NodeStatusEvent) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === event.nodeId
            ? { ...node, status: event.status }
            : node,
        ),
      );
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Derive summary stats
  const stats: ClusterStats = {
    totalNodes: nodes.length,
    onlineNodes: nodes.filter((n) => n.status === 'ONLINE').length,
    totalViewers: nodes.reduce((sum, n) => sum + (n.viewers || 0), 0),
    totalBandwidth: nodes.reduce((sum, n) => sum + parseBandwidth(n.bandwidth), 0),
  };

  return { nodes, loading, error, refetch: fetchNodes, stats };
}
