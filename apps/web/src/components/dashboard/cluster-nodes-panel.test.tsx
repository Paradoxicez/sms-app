/**
 * Phase 18 Wave 0 — Platform ClusterNodesPanel tests.
 * Every `it` maps to UI-05 / D-08 verifiable behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ClusterNodesPanel } from './cluster-nodes-panel';

const useClusterNodesMock = vi.fn();

vi.mock('@/hooks/use-cluster-nodes', () => ({
  useClusterNodes: () => useClusterNodesMock(),
}));

describe('ClusterNodesPanel (Phase 18 — platform dashboard)', () => {
  beforeEach(() => {
    useClusterNodesMock.mockReset();
  });

  it('UI-05: consumes useClusterNodes hook (D-08)', () => {
    useClusterNodesMock.mockReturnValue({
      nodes: [
        {
          id: 'n1',
          name: 'origin-01',
          role: 'ORIGIN',
          status: 'ONLINE',
          uptime: 90061,
          viewers: 42,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
      stats: { totalNodes: 1, onlineNodes: 1, totalViewers: 42, totalBandwidth: 0 },
    });

    render(<ClusterNodesPanel />);

    expect(useClusterNodesMock).toHaveBeenCalled();
    expect(screen.getByText('origin-01')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('UI-05: renders 5 columns: Node, Role, Status, Uptime, Connections', () => {
    useClusterNodesMock.mockReturnValue({
      nodes: [
        {
          id: 'n1',
          name: 'origin-01',
          role: 'ORIGIN',
          status: 'ONLINE',
          uptime: 3600,
          viewers: 0,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
      stats: { totalNodes: 1, onlineNodes: 1, totalViewers: 0, totalBandwidth: 0 },
    });

    render(<ClusterNodesPanel />);

    expect(screen.getByRole('columnheader', { name: /node/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /role/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /uptime/i })).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /connections/i }),
    ).toBeInTheDocument();
  });

  it('UI-05: empty state renders "No cluster nodes registered."', () => {
    useClusterNodesMock.mockReturnValue({
      nodes: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
      stats: { totalNodes: 0, onlineNodes: 0, totalViewers: 0, totalBandwidth: 0 },
    });

    render(<ClusterNodesPanel />);

    expect(screen.getByText('No cluster nodes registered.')).toBeInTheDocument();
  });
});
