'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, RefreshCw, Trash2 } from 'lucide-react';
import type { SrsNode } from '@/hooks/use-cluster-nodes';

function formatBandwidth(bytes: string | number | null): string {
  const n = Number(bytes ?? 0);
  if (isNaN(n) || n === 0) return '0 B/s';
  if (n < 1024) return `${n} B/s`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB/s`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

function getMetricColor(value: number | null): string {
  if (value == null) return 'bg-muted';
  if (value < 70) return 'bg-chart-1';
  if (value < 90) return 'bg-chart-4';
  return 'bg-chart-5';
}

function StatusBadge({ status }: { status: SrsNode['status'] }) {
  const config: Record<SrsNode['status'], { className: string; label: string }> = {
    ONLINE: { className: 'bg-chart-1 text-white', label: 'Online' },
    OFFLINE: { className: 'bg-chart-5 text-white', label: 'Offline' },
    DEGRADED: { className: 'bg-chart-4 text-white', label: 'Degraded' },
    CONNECTING: { className: 'bg-blue-500 text-white', label: 'Connecting' },
  };
  const c = config[status] ?? config.OFFLINE;
  return <Badge className={c.className}>{c.label}</Badge>;
}

function MetricBar({ value }: { value: number | null }) {
  const pct = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${getMetricColor(value)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {value != null ? `${Math.round(pct)}%` : '--'}
      </span>
    </div>
  );
}

// Sort: offline first, then degraded, then connecting, then online
const statusOrder: Record<SrsNode['status'], number> = {
  OFFLINE: 0,
  DEGRADED: 1,
  CONNECTING: 2,
  ONLINE: 3,
};

interface NodeTableProps {
  nodes: SrsNode[];
  loading: boolean;
  onViewDetails: (node: SrsNode) => void;
  onReloadConfig: (node: SrsNode) => void;
  onRemoveNode: (node: SrsNode) => void;
}

export function NodeTable({
  nodes,
  loading,
  onViewDetails,
  onReloadConfig,
  onRemoveNode,
}: NodeTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const sorted = [...nodes].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status],
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>URL</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>CPU</TableHead>
          <TableHead>Memory</TableHead>
          <TableHead>Viewers</TableHead>
          <TableHead>Bandwidth</TableHead>
          <TableHead className="w-10">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((node) => (
          <TableRow key={node.id}>
            <TableCell className="font-medium">{node.name}</TableCell>
            <TableCell>
              {node.role === 'ORIGIN' ? (
                <Badge variant="outline">Origin</Badge>
              ) : (
                <Badge variant="secondary">Edge</Badge>
              )}
            </TableCell>
            <TableCell className="max-w-[200px] truncate text-muted-foreground">
              {node.hlsUrl}
            </TableCell>
            <TableCell>
              <StatusBadge status={node.status} />
            </TableCell>
            <TableCell>
              <MetricBar value={node.cpu} />
            </TableCell>
            <TableCell>
              <MetricBar value={node.memory} />
            </TableCell>
            <TableCell className="tabular-nums">{node.viewers}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatBandwidth(node.bandwidth)}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" />
                  }
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onViewDetails(node)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onReloadConfig(node)}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reload Config
                  </DropdownMenuItem>
                  {node.role === 'EDGE' && (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onRemoveNode(node)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Node
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
