'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { useFeatureCheck } from '@/hooks/use-feature-check';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AuditLogTable } from '@/components/audit/audit-log-table';
import type { AuditLog } from '@/components/audit/audit-detail-dialog';

interface AuditResponse {
  items: AuditLog[];
  nextCursor: string | null;
}

const ACTION_OPTIONS = [
  { label: 'All', value: '__all__' },
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
];

export default function TenantAuditLogPage() {
  const { enabled: featureEnabled, loading: featureLoading } = useFeatureCheck('auditLog');

  const [entries, setEntries] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [actionFilter, setActionFilter] = useState<string>('__all__');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

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
          params.set('dateFrom', dateFrom.toISOString());
        }
        if (dateTo) {
          // Set to end of day
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          params.set('dateTo', end.toISOString());
        }
        if (append && existingCursor) {
          params.set('cursor', existingCursor);
        }

        const data = await apiFetch<AuditResponse>(
          `/api/audit-log?${params.toString()}`,
        );

        if (append) {
          setEntries((prev) => [...prev, ...data.items]);
        } else {
          setEntries(data.items);
        }
        setCursor(data.nextCursor);
      } catch {
        setError('Unable to load audit entries. Try adjusting your filters or refreshing.');
      } finally {
        setLoading(false);
      }
    },
    [actionFilter, dateFrom, dateTo],
  );

  useEffect(() => {
    if (featureEnabled && !featureLoading) {
      fetchEntries(false);
    }
  }, [featureEnabled, featureLoading, fetchEntries]);

  function handleApplyFilters() {
    setEntries([]);
    setCursor(null);
    fetchEntries(false);
  }

  function handleLoadMore() {
    fetchEntries(true, cursor);
  }

  if (featureLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!featureEnabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">Audit log not available</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The audit log feature is not included in your current plan. Contact your administrator to upgrade.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Audit Log</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Action Type</label>
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
          <label className="text-xs font-medium text-muted-foreground">
            From
          </label>
          <DatePicker
            date={dateFrom}
            onDateChange={setDateFrom}
            placeholder="Start date"
            className="w-[160px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            To
          </label>
          <DatePicker
            date={dateTo}
            onDateChange={setDateTo}
            placeholder="End date"
            className="w-[160px]"
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

      <AuditLogTable
        entries={entries}
        loading={loading}
        onLoadMore={handleLoadMore}
        hasMore={cursor !== null}
      />
    </div>
  );
}
