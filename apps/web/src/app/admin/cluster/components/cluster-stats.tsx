'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ClusterStats as ClusterStatsData } from '@/hooks/use-cluster-nodes';

function formatBandwidth(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

interface ClusterStatsProps {
  stats: ClusterStatsData;
  loading: boolean;
}

export function ClusterStats({ stats, loading }: ClusterStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    { label: 'Total Nodes', value: stats.totalNodes.toString() },
    { label: 'Online Nodes', value: stats.onlineNodes.toString(), accent: true },
    { label: 'Total Edge Viewers', value: stats.totalViewers.toString() },
    { label: 'Cluster Bandwidth', value: formatBandwidth(stats.totalBandwidth) },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="pb-2">
            <span className="text-xs text-muted-foreground">{card.label}</span>
          </CardHeader>
          <CardContent>
            <span className="text-[28px] font-semibold leading-tight">
              {card.value}
            </span>
            {card.accent && (
              <span className="ml-2 inline-flex h-5 items-center rounded-full bg-chart-1 px-2 text-xs font-medium text-white">
                Online
              </span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
