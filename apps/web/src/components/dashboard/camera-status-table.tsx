'use client';

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import type { DashboardCamera } from '@/hooks/use-dashboard-stats';
import { cn } from '@/lib/utils';

interface CameraStatusTableProps {
  cameras: DashboardCamera[];
  loading: boolean;
}

const STATUS_ORDER: Record<string, number> = {
  offline: 0,
  degraded: 1,
  reconnecting: 2,
  connecting: 3,
  online: 4,
};

const STATUS_STYLES: Record<string, { className: string; label: string }> = {
  online: {
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    label: 'Online',
  },
  offline: {
    className: 'bg-red-500/10 text-red-700 dark:text-red-400',
    label: 'Offline',
  },
  degraded: {
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    label: 'Degraded',
  },
  connecting: {
    className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    label: 'Connecting',
  },
  reconnecting: {
    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 animate-pulse',
    label: 'Reconnecting',
  },
};

function formatBandwidth(bytes: number): string {
  if (bytes == null || typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0)
    return '0 B/s';
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.offline;
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent', style.className)}
    >
      {style.label}
    </Badge>
  );
}

export function CameraStatusTable({ cameras, loading }: CameraStatusTableProps) {
  const sortedCameras = [...cameras].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Camera Status</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : sortedCameras.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No cameras found
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Viewers</TableHead>
                <TableHead className="text-right">Bandwidth</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCameras.map((camera) => (
                <TableRow key={camera.id}>
                  <TableCell>
                    <Link
                      href={`/admin/cameras/${camera.id}`}
                      className="font-medium hover:underline"
                    >
                      {camera.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={camera.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {camera.viewerCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatBandwidth(camera.bandwidth)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
