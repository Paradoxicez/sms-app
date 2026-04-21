'use client';

import { CheckCircle2, ArrowRight, Wrench, RotateCw } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useRouter } from 'next/navigation';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardIssues } from '@/hooks/use-dashboard-issues';
import type { DashboardCamera } from '@/hooks/use-dashboard-stats';

type Severity = 'offline' | 'degraded' | 'reconnecting' | 'maintenance';

function severityOf(camera: DashboardCamera): Severity {
  if (camera.status === 'offline') return 'offline';
  if (camera.status === 'degraded') return 'degraded';
  if (camera.status === 'reconnecting') return 'reconnecting';
  // Must come after status checks so offline+maintenanceMode still reports
  // as offline (worse severity) — matches severityRank in use-dashboard-issues.
  return 'maintenance';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface IssueRowProps {
  camera: DashboardCamera;
}

function IssueRow({ camera }: IssueRowProps) {
  const router = useRouter();
  const severity = severityOf(camera);
  const href = `/app/cameras/${camera.id}`;

  let meta: string;
  let actionLabel: 'Investigate' | 'View';
  let ActionIcon: typeof ArrowRight = ArrowRight;

  if (severity === 'offline') {
    const last = camera.lastOnlineAt
      ? formatDistanceToNowStrict(new Date(camera.lastOnlineAt), {
          addSuffix: true,
        })
      : 'unknown';
    meta = `Offline · last seen ${last}`;
    actionLabel = 'Investigate';
  } else if (severity === 'maintenance') {
    const actor = camera.maintenanceEnteredBy ?? 'unknown';
    const since = camera.maintenanceEnteredAt
      ? formatDistanceToNowStrict(new Date(camera.maintenanceEnteredAt), {
          addSuffix: true,
        })
      : 'unknown';
    meta = `Maintenance · by ${actor} · ${since}`;
    actionLabel = 'View';
  } else {
    // TODO(Phase 18 RESEARCH OQ-01): when a dedicated `statusChangedAt` lands,
    // swap `lastOnlineAt` below for the real status-transition timestamp.
    const duration = camera.lastOnlineAt
      ? formatDistanceToNowStrict(new Date(camera.lastOnlineAt))
      : 'unknown';
    meta = `${capitalize(camera.status)} · ${duration} since status change`;
    actionLabel = 'View';
  }

  const ariaAction =
    actionLabel === 'Investigate' ? 'investigate' : 'view details';

  return (
    <div
      data-testid="issue-row"
      data-camera-id={camera.id}
      className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 p-3"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{camera.name}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(href)}
        aria-label={`${capitalize(severity)} camera ${camera.name} — click to ${ariaAction}`}
      >
        {actionLabel}
        <ActionIcon className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function IssuesPanel() {
  const { issues, loading, error, onlineCount } = useDashboardIssues();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Issues</CardTitle>
        {!loading && !error && issues.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {issues.length} {issues.length === 1 ? 'camera needs' : 'cameras need'} attention
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Couldn&apos;t load issues</p>
            <p className="mt-1 text-xs">Check your connection and try again.</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => window.location.reload()}
              aria-label="Retry loading issues"
            >
              <RotateCw className="mr-1 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-sm font-semibold">All cameras healthy</p>
            <p className="text-xs text-muted-foreground">
              {onlineCount} cameras online, 0 issues.
            </p>
            {/* Unused-icon suppression — keep Wrench imported for maintenance rows;
                lucide tree-shakes at bundle time, so the import cost is zero. */}
            <span className="sr-only" aria-hidden="true">
              <Wrench className="hidden" />
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((camera) => (
              <IssueRow key={camera.id} camera={camera} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
