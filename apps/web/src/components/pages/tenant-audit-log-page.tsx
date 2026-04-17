'use client';

import { ShieldAlert } from 'lucide-react';

import { useFeatureCheck } from '@/hooks/use-feature-check';
import { Skeleton } from '@/components/ui/skeleton';
import { AuditLogDataTable } from '@/components/audit/audit-log-data-table';

export default function TenantAuditLogPage() {
  const { enabled: featureEnabled, loading: featureLoading } = useFeatureCheck('auditLog');

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
      <AuditLogDataTable apiUrl="/api/audit-log" />
    </div>
  );
}
