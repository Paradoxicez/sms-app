'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';

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
import { AuditDetailDialog, type AuditLog } from './audit-detail-dialog';

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  create: 'default',
  update: 'secondary',
  delete: 'destructive',
};

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

interface AuditLogTableProps {
  entries: AuditLog[];
  loading: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
}

export function AuditLogTable({ entries, loading, onLoadMore, hasMore }: AuditLogTableProps) {
  const [selectedEntry, setSelectedEntry] = useState<AuditLog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleView(entry: AuditLog) {
    setSelectedEntry(entry);
    setDialogOpen(true);
  }

  if (loading && entries.length === 0) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!loading && entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">No activity recorded</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Actions will appear here as users interact with the platform.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead className="w-20">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-mono text-xs">
                {formatTimestamp(entry.createdAt)}
              </TableCell>
              <TableCell>
                <div>
                  <span className="text-sm">
                    {entry.user?.name || 'System'}
                  </span>
                  {entry.user?.email && (
                    <span className="block text-xs text-muted-foreground">
                      {entry.user.email}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={ACTION_VARIANT[entry.action] ?? 'default'}>
                  {entry.action}
                </Badge>
              </TableCell>
              <TableCell>
                <div>
                  <span className="text-sm">{entry.resource}</span>
                  {entry.resourceId && (
                    <span className="block text-xs text-muted-foreground font-mono">
                      {entry.resourceId}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs font-mono">
                {entry.ip}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleView(entry)}
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {hasMore && (
        <div className="flex justify-center py-4">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}

      <AuditDetailDialog
        entry={selectedEntry}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
