'use client';

/**
 * Phase 18 Plan 05 — Super-admin Recent Activity highlights (D-11).
 *
 * Up to 7 audit rows + a footer link to the full audit log.
 */

import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowRight } from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useRecentAudit,
  type AuditHighlight,
} from '@/hooks/use-platform-dashboard';

function verbForAction(action: string): string {
  const a = action.toLowerCase();
  if (a === 'create' || a.endsWith('.create')) return 'created';
  if (a === 'update' || a.endsWith('.update')) return 'updated';
  if (a === 'delete' || a.endsWith('.delete')) return 'deleted';
  return action;
}

function formatEntry(entry: AuditHighlight): string {
  const actor = entry.actorName ?? 'System';
  const verb = verbForAction(entry.action);
  const target = entry.resource;
  const orgSuffix = entry.orgName ? ` ${entry.orgName}` : '';
  return `${actor} ${verb} ${target}${orgSuffix}`;
}

export function RecentAuditHighlights() {
  const { entries, loading, error } = useRecentAudit(7);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-6 w-full rounded-md" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No recent platform activity.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.slice(0, 7).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">{formatEntry(entry)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNowStrict(new Date(entry.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 border-t pt-2">
          <Link
            href="/admin/audit"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View full audit log
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
