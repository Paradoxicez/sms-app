'use client';

/**
 * Phase 18 Plan 06 — Org Health DataTable columns (D-12).
 *
 * Exports a column factory `makeOrgHealthColumns(router)` so each row's
 * Actions dropdown can imperatively navigate. Also exposes a hidden computed
 * column `maxUsagePct` used by the DataTable's `initialState` to sort by
 * max(cameraUsagePct, storageUsagePct) desc without mutating the data array.
 */

import type { ColumnDef } from '@tanstack/react-table';
import type { useRouter } from 'next/navigation';
import { Eye, MoreHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/ui/data-table';
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from '@/components/ui/progress';

import type { OrgHealth } from '@/hooks/use-platform-dashboard';
export type { OrgHealth } from '@/hooks/use-platform-dashboard';

// --- Helpers --------------------------------------------------------------

const BYTES_PER_GB = 1024 * 1024 * 1024;

function bytesStringToGb(bytes: string): number {
  try {
    const big = BigInt(bytes);
    const gb = BYTES_PER_GB;
    // divmod preserves fractional precision past Number.MAX_SAFE_INTEGER.
    const whole = Number(big / BigInt(gb));
    const frac = Number(big % BigInt(gb)) / gb;
    return whole + frac;
  } catch {
    return 0;
  }
}

function formatBytes(bytesStr: string): string {
  const gb = bytesStringToGb(bytesStr);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  try {
    const n = Number(BigInt(bytesStr));
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
  } catch {
    return '0 B';
  }
}

// --- Column factory -------------------------------------------------------

export function makeOrgHealthColumns(
  router: ReturnType<typeof useRouter>,
): ColumnDef<OrgHealth, unknown>[] {
  return [
    {
      id: 'orgName',
      accessorKey: 'orgName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Organization" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.orgName}</span>
      ),
    },
    {
      id: 'packageName',
      accessorKey: 'packageName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Plan" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.packageName ?? 'No plan'}</Badge>
      ),
      filterFn: (row, id, value: string[]) =>
        value.includes((row.getValue(id) as string) ?? 'No plan'),
    },
    {
      id: 'cameras',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Cameras" />
      ),
      cell: ({ row }) => {
        const used = row.original.camerasUsed;
        const limit = row.original.camerasLimit;
        const pct = row.original.cameraUsagePct ?? 0;
        return (
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              {used} / {limit ?? '∞'}
            </span>
            <Progress value={pct} className="w-16" aria-label="Camera usage">
              <ProgressTrack className="h-1">
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          </div>
        );
      },
      sortingFn: (a, b) =>
        (a.original.cameraUsagePct ?? 0) - (b.original.cameraUsagePct ?? 0),
    },
    {
      id: 'storage',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Storage" />
      ),
      cell: ({ row }) => {
        const usedGb = bytesStringToGb(row.original.storageUsedBytes);
        const limit = row.original.storageLimitGb;
        const pct = row.original.storageUsagePct ?? 0;
        return (
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              {usedGb.toFixed(1)} GB / {limit ?? '∞'} GB
            </span>
            <Progress value={pct} className="w-16" aria-label="Storage usage">
              <ProgressTrack className="h-1">
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          </div>
        );
      },
      sortingFn: (a, b) =>
        (a.original.storageUsagePct ?? 0) - (b.original.storageUsagePct ?? 0),
    },
    {
      id: 'bandwidthToday',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Bandwidth (today)" />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatBytes(row.original.bandwidthTodayBytes)}
        </span>
      ),
    },
    {
      id: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const count = row.original.issuesCount ?? 0;
        if (count > 0) {
          return <Badge variant="destructive">{count} issues</Badge>;
        }
        return <Badge variant="outline">Healthy</Badge>;
      },
      sortingFn: (a, b) =>
        (a.original.issuesCount ?? 0) - (b.original.issuesCount ?? 0),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div
          // Prevent row onClick navigation when clicking the menu trigger.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open menu"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-[140px]">
              <DropdownMenuItem
                className="py-1 text-sm"
                onClick={() =>
                  router.push(
                    `/admin/organizations?highlight=${row.original.orgId}`,
                  )
                }
              >
                <Eye className="mr-2 size-4" />
                View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
    // Hidden computed column used to drive the default sort by
    // max(cameraUsagePct, storageUsagePct) desc. See W6 in the plan —
    // declared in `initialState.sorting` on the DataTable wrapper so TanStack
    // owns the sort state and the visible usage columns can still toggle.
    {
      id: 'maxUsagePct',
      accessorFn: (row) =>
        Math.max(row.cameraUsagePct ?? 0, row.storageUsagePct ?? 0),
      header: () => null,
      cell: () => null,
      enableHiding: true,
    },
  ];
}
