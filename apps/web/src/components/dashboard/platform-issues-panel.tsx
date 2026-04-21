'use client';

/**
 * Phase 18 Plan 05 — Super-admin Platform Issues panel (D-09).
 *
 * Cross-org issues list with a reward empty state ("Platform healthy") and
 * per-type rows carrying a navigation action (Investigate / View cluster / …).
 */

import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ArrowRight,
  Wrench,
  Activity,
  AlertTriangle,
  Circle,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePlatformIssues,
  type PlatformIssue,
} from '@/hooks/use-platform-dashboard';

type IssueAction = {
  label: string;
  onClick: () => void;
  ariaLabel: string;
};

function formatIssue(
  issue: PlatformIssue,
  router: ReturnType<typeof useRouter>,
): { text: string; meta?: string; action: IssueAction; icon: React.ReactNode } {
  const meta = (issue.meta ?? {}) as Record<string, unknown>;

  switch (issue.type) {
    case 'srs-down':
      return {
        text: 'SRS origin unreachable',
        action: {
          label: 'Investigate',
          onClick: () => router.push('/admin/cluster'),
          ariaLabel: 'Investigate SRS origin unreachable',
        },
        icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
      };
    case 'edge-down': {
      const nodeName = (meta.nodeName as string) ?? (meta.name as string) ?? 'unknown';
      const since = (meta.since as string) ?? (meta.disconnectedFor as string);
      return {
        text: `Edge node ${nodeName} disconnected`,
        meta: since,
        action: {
          label: 'View cluster',
          onClick: () => router.push('/admin/cluster'),
          ariaLabel: `View cluster for disconnected edge node ${nodeName}`,
        },
        icon: <Activity className="h-4 w-4 text-amber-500" />,
      };
    }
    case 'minio-down':
      return {
        text: 'MinIO storage unreachable',
        action: {
          label: 'Investigate',
          onClick: () => router.push('/admin/storage'),
          ariaLabel: 'Investigate MinIO storage unreachable',
        },
        icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
      };
    case 'ffmpeg-saturated': {
      const current = (meta.current as number) ?? 0;
      const max = (meta.max as number) ?? 0;
      return {
        text: `FFmpeg worker pool saturated (${current}/${max})`,
        action: {
          label: 'View processes',
          onClick: () => router.push('/admin/processes'),
          ariaLabel: 'View FFmpeg processes',
        },
        icon: <Wrench className="h-4 w-4 text-amber-500" />,
      };
    }
    case 'org-offline-rate': {
      const orgName = (meta.orgName as string) ?? 'Unknown org';
      const orgId = (meta.orgId as string) ?? '';
      const pct = (meta.offlinePct as number) ?? 0;
      return {
        text: `${orgName}: ${pct}% cameras offline`,
        action: {
          label: 'View org',
          onClick: () => router.push(`/admin/organizations/${orgId}`),
          ariaLabel: `View organization ${orgName}`,
        },
        icon: <Circle className="h-4 w-4 text-amber-500" />,
      };
    }
    default: {
      const anyIssue = issue as PlatformIssue;
      return {
        text: anyIssue.label ?? 'Unknown platform issue',
        action: {
          label: 'Investigate',
          onClick: () => router.push('/admin'),
          ariaLabel: 'Investigate unknown platform issue',
        },
        icon: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
      };
    }
  }
}

export function PlatformIssuesPanel() {
  const router = useRouter();
  const { issues, loading, error } = usePlatformIssues();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Platform Issues</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 text-sm font-medium">Platform healthy</p>
            <p className="text-xs text-muted-foreground">
              All subsystems operational.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {issues.map((issue, idx) => {
              const { text, meta, action, icon } = formatIssue(issue, router);
              return (
                <li
                  key={`${issue.type}-${idx}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0">{icon}</span>
                    <span className="truncate">{text}</span>
                    {meta ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {meta}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={action.onClick}
                    aria-label={action.ariaLabel}
                    className="shrink-0"
                  >
                    {action.label}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
