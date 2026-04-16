'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileText } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AuditDetailDialog, type AuditLog } from '@/components/audit/audit-detail-dialog';

interface PlatformAuditLog extends AuditLog {
  orgName?: string;
}

interface AuditResponse {
  items: PlatformAuditLog[];
  nextCursor: string | null;
}

const ACTION_OPTIONS = [
  { label: 'All', value: '__all__' },
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
];

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

export default function PlatformAuditLogPage() {
  const [entries, setEntries] = useState<PlatformAuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [actionFilter, setActionFilter] = useState<string>('__all__');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Detail dialog
  const [selectedEntry, setSelectedEntry] = useState<PlatformAuditLog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchEntries = useCallback(
    async (append = false, existingCursor?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('take', '50');

        if (actionFilter !== '__all__') {
          params.set('action', actionFilter);
        }
        if (dateFrom) {
          params.set('dateFrom', new Date(dateFrom).toISOString());
        }
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          params.set('dateTo', end.toISOString());
        }
        if (append && existingCursor) {
          params.set('cursor', existingCursor);
        }

        const data = await apiFetch<AuditResponse>(
          `/api/admin/audit-log?${params.toString()}`,
        );

        if (append) {
          setEntries((prev) => [...prev, ...data.items]);
        } else {
          setEntries(data.items);
        }
        setCursor(data.nextCursor);
      } catch {
        setError(
          'Unable to load audit entries. Try adjusting your filters or refreshing.',
        );
      } finally {
        setLoading(false);
      }
    },
    [actionFilter, dateFrom, dateTo],
  );

  useEffect(() => {
    fetchEntries(false);
  }, [fetchEntries]);

  function handleApplyFilters() {
    setEntries([]);
    setCursor(null);
    fetchEntries(false);
  }

  function handleLoadMore() {
    fetchEntries(true, cursor);
  }

  function handleView(entry: PlatformAuditLog) {
    setSelectedEntry(entry);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Platform Audit Log</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Action Type
          </label>
          <Select
            value={actionFilter}
            onValueChange={(v) => setActionFilter(String(v ?? '__all__'))}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="dateFrom"
            className="text-xs font-medium text-muted-foreground"
          >
            From
          </label>
          <input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex h-8 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="dateTo"
            className="text-xs font-medium text-muted-foreground"
          >
            To
          </label>
          <input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex h-8 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <Button size="sm" onClick={handleApplyFilters}>
          Apply
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Audit log table with Organization column */}
      {loading && entries.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !loading && entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No activity recorded</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Actions will appear here as users interact with the platform.
          </p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Organization</TableHead>
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
                  <TableCell className="text-sm">
                    {entry.orgName || 'Unknown'}
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
                    <Badge
                      variant={ACTION_VARIANT[entry.action] ?? 'default'}
                    >
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

          {cursor !== null && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
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
      )}
    </div>
  );
}
