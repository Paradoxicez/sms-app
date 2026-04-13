'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { useClusterNodes } from '@/hooks/use-cluster-nodes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClusterStats } from './components/cluster-stats';
import { NodeTable } from './components/node-table';
import { AddNodeDialog } from './components/add-node-dialog';
import { NodeDetailDialog } from './components/node-detail-dialog';
import { RemoveNodeDialog } from './components/remove-node-dialog';
import type { SrsNode } from '@/hooks/use-cluster-nodes';

export default function ClusterPage() {
  const { nodes, loading, error, refetch, stats } = useClusterNodes();

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailNode, setDetailNode] = useState<SrsNode | null>(null);
  const [removeNode, setRemoveNode] = useState<SrsNode | null>(null);

  async function handleReloadConfig(node: SrsNode) {
    try {
      await apiFetch(`/api/cluster/nodes/${node.id}/reload`, {
        method: 'POST',
      });
      toast.success(`Configuration reloaded on ${node.name}`);
    } catch {
      toast.error(`Failed to reload configuration on ${node.name}`);
    }
  }

  const hasEdgeNodes = nodes.some((n) => n.role === 'EDGE');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cluster Nodes</h1>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Edge Node
        </Button>
      </div>

      {/* Summary Stats */}
      <ClusterStats stats={stats} loading={loading} />

      {/* Error State */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button
            variant="outline"
            size="sm"
            className="ml-4"
            onClick={refetch}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Node Table or Empty State */}
      {!loading && !error && !hasEdgeNodes && nodes.length <= 1 ? (
        <Card>
          <CardHeader className="text-center">
            <CardTitle>No edge nodes configured</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Your platform is running on a single SRS origin node. Add edge
              nodes to scale HLS delivery and enable failover.
            </p>
            <Button onClick={() => setAddDialogOpen(true)}>
              Add Your First Edge Node
            </Button>
          </CardContent>
        </Card>
      ) : (
        !error && (
          <NodeTable
            nodes={nodes}
            loading={loading}
            onViewDetails={(node) => setDetailNode(node)}
            onReloadConfig={handleReloadConfig}
            onRemoveNode={(node) => setRemoveNode(node)}
          />
        )
      )}

      {/* Dialogs */}
      <AddNodeDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={refetch}
      />
      <NodeDetailDialog
        node={detailNode}
        open={!!detailNode}
        onOpenChange={(o) => {
          if (!o) setDetailNode(null);
        }}
      />
      <RemoveNodeDialog
        node={removeNode}
        open={!!removeNode}
        onOpenChange={(o) => {
          if (!o) setRemoveNode(null);
        }}
        onSuccess={refetch}
      />
    </div>
  );
}
