'use client';

import { Radio, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { CameraRow } from './cameras-columns';

type CameraStatus = 'online' | 'offline' | 'degraded' | 'connecting' | 'reconnecting';

interface CameraStatusBadgeProps {
  status: CameraStatus;
  showLabel?: boolean;
}

const statusConfig: Record<CameraStatus, {
  label: string;
  dotClass: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
}> = {
  online: {
    label: 'Online',
    dotClass: 'bg-primary',
    badgeVariant: 'default',
  },
  offline: {
    label: 'Offline',
    dotClass: 'border border-muted-foreground bg-transparent',
    badgeVariant: 'secondary',
  },
  degraded: {
    label: 'Degraded',
    dotClass: 'bg-amber-500',
    badgeVariant: 'outline',
  },
  connecting: {
    label: 'Connecting',
    dotClass: 'animate-pulse bg-primary',
    badgeVariant: 'outline',
  },
  reconnecting: {
    label: 'Reconnecting',
    dotClass: 'animate-pulse bg-amber-500',
    badgeVariant: 'outline',
  },
};

export function CameraStatusDot({ status }: { status: CameraStatus }) {
  const config = statusConfig[status] || statusConfig.offline;
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${config.dotClass}`}
      title={config.label}
    />
  );
}

export function CameraStatusBadge({ status, showLabel = true }: CameraStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.offline;
  return (
    <Badge variant={config.badgeVariant} className="gap-1.5 text-xs">
      <span className={`inline-block h-2 w-2 rounded-full ${config.dotClass}`} />
      {showLabel && config.label}
    </Badge>
  );
}

// ───────────────────────── Phase 20 ─────────────────────────
// StatusPills — expressive LIVE/REC/MAINT/OFFLINE pills for the Cameras
// table Status column. Token reuse from apps/web/src/components/map/
// camera-popup.tsx:201-214 enforced byte-for-byte so table ↔ map read
// as one design language. See D-12..D-16 + UI-SPEC §Color.
//
// Ordering per D-14: stream-state (LIVE | reconnecting) → REC → MAINT.
// Suppression per D-14: when maintenanceMode=true, LIVE/reconnecting
// pills are suppressed (maintenance wins).

const PILL_BASE =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm';

// Module-scope className constants — single source of truth shared by
// `StatusPills` (table view) and `CameraStatusPill` (card-view overlay).
// A future visual tweak to either LIVE pill updates both views in one
// edit. See quick-task 260425-vrl.
const PILL_LIVE_RED = cn(
  PILL_BASE,
  'bg-red-500/95 text-white motion-safe:animate-pulse motion-reduce:animate-none'
);
const PILL_LIVE_AMBER = cn(
  PILL_BASE,
  'border border-amber-500 bg-transparent text-amber-700 dark:text-amber-400',
  'motion-safe:animate-pulse motion-reduce:animate-none [animation-duration:1s]'
);
const PILL_OFFLINE = cn(
  PILL_BASE,
  'border border-border bg-muted text-muted-foreground'
);

export interface StatusPillsProps {
  camera: Pick<CameraRow, 'status' | 'isRecording' | 'maintenanceMode'>;
}

export function StatusPills({ camera }: StatusPillsProps) {
  const { status, isRecording, maintenanceMode } = camera;
  const isOnline = status === 'online';
  const isReconnecting = status === 'reconnecting' || status === 'connecting';
  const shouldShowOffline =
    !isOnline && !isReconnecting && !isRecording && !maintenanceMode;

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Camera status">
      {isOnline && !maintenanceMode && (
        <span className={PILL_LIVE_RED} aria-label="Live">
          <Radio className="size-3" aria-hidden="true" />
          LIVE
        </span>
      )}
      {isReconnecting && !maintenanceMode && (
        <span className={PILL_LIVE_AMBER} aria-label="Reconnecting">
          <Radio className="size-3" aria-hidden="true" />
          LIVE
        </span>
      )}
      {isRecording && (
        <span
          className={cn(PILL_BASE, 'bg-zinc-900 text-white dark:bg-zinc-800')}
          aria-label="Recording"
        >
          <span
            className="size-1.5 rounded-full bg-red-500 motion-safe:animate-pulse motion-reduce:animate-none"
            aria-hidden="true"
          />
          REC
        </span>
      )}
      {maintenanceMode && (
        <span
          className={cn(
            PILL_BASE,
            'border border-amber-300 bg-amber-100 text-amber-800',
            'dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          )}
          aria-label="In maintenance — notifications suppressed"
        >
          <Wrench className="size-3" aria-hidden="true" />
          MAINT
        </span>
      )}
      {shouldShowOffline && (
        <span className={PILL_OFFLINE} aria-label="Offline">
          <span
            className="size-2 rounded-full border border-muted-foreground bg-transparent"
            aria-hidden="true"
          />
          OFFLINE
        </span>
      )}
    </div>
  );
}

// ───────────────────────── Quick 260425-vrl ─────────────────────────
// CameraStatusPill — status-only variant consumed by the camera-card
// thumbnail overlay (apps/web/src/app/admin/cameras/components/
// camera-card.tsx). Renders the SAME visual treatment as the table-view
// `StatusPills` LIVE branches (online → red, reconnecting/connecting →
// amber) and the OFFLINE pill, by reading from the same module-scope
// className constants. Anything that is not online / reconnecting /
// connecting falls through to OFFLINE.

export interface CameraStatusPillProps {
  status: CameraStatus;
}

export function CameraStatusPill({ status }: CameraStatusPillProps) {
  const isOnline = status === 'online';
  const isReconnecting = status === 'reconnecting' || status === 'connecting';

  if (isOnline) {
    return (
      <span className={PILL_LIVE_RED} aria-label="Live">
        <Radio className="size-3" aria-hidden="true" />
        LIVE
      </span>
    );
  }
  if (isReconnecting) {
    return (
      <span className={PILL_LIVE_AMBER} aria-label="Live">
        <Radio className="size-3" aria-hidden="true" />
        LIVE
      </span>
    );
  }
  return (
    <span className={PILL_OFFLINE} aria-label="Offline">
      <span
        className="size-2 rounded-full border border-muted-foreground bg-transparent"
        aria-hidden="true"
      />
      OFFLINE
    </span>
  );
}
