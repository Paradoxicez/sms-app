'use client';

import { Badge } from '@/components/ui/badge';

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
