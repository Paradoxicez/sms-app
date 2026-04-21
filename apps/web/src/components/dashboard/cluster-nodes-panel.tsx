'use client';

/**
 * Phase 18 Plan 05 — Super-admin Cluster & Edge Nodes panel (D-08).
 *
 * Consumes the existing `useClusterNodes` hook (Socket.IO real-time on top of
 * REST) and renders a 5-column status table.
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useClusterNodes, type SrsNode } from '@/hooks/use-cluster-nodes';

function formatUptime(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && hours === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

const STATUS_DOT: Record<SrsNode['status'], string> = {
  ONLINE: 'bg-emerald-500',
  OFFLINE: 'bg-red-500',
  DEGRADED: 'bg-amber-500',
  CONNECTING: 'bg-blue-500',
};

export function ClusterNodesPanel() {
  const { nodes, loading, error } = useClusterNodes();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Cluster & Edge Nodes</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : nodes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No cluster nodes registered.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Node</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uptime</TableHead>
                <TableHead className="text-right">Connections</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((node) => (
                <TableRow key={node.id}>
                  <TableCell className="font-medium">{node.name}</TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">
                    {node.role}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[node.status]}`}
                      />
                      <span className="text-xs">{node.status}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatUptime(node.uptime)}
                  </TableCell>
                  <TableCell className="text-right">{node.viewers}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
