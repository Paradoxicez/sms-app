'use client';

/**
 * Phase 18 Plan 06 — Org Health DataTable (D-12).
 *
 * Replaces the raw Organization Summary Table on the super-admin dashboard.
 * Default sort (usage percent desc) is driven by a hidden computed column
 * `maxUsagePct` via TanStack's `initialState.sorting` — the data array is
 * passed verbatim so the sort indicator arrow stays wired on the visible
 * usage columns.
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { useOrgHealthOverview } from '@/hooks/use-platform-dashboard';

import { makeOrgHealthColumns } from './org-health-columns';

export function OrgHealthDataTable() {
  const router = useRouter();
  const { orgs, loading } = useOrgHealthOverview();

  const columns = useMemo(() => makeOrgHealthColumns(router), [router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Organization Health</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={orgs}
          loading={loading}
          onRowClick={(row) =>
            router.push(`/admin/organizations?highlight=${row.orgId}`)
          }
          emptyState={{
            title: 'No organizations yet',
            description: 'Organizations will appear here once onboarded.',
          }}
          initialState={{
            sorting: [{ id: 'maxUsagePct', desc: true }],
            columnVisibility: { maxUsagePct: false },
          }}
        />
      </CardContent>
    </Card>
  );
}
