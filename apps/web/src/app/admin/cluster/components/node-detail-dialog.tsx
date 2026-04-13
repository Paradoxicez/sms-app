'use client';

import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { SrsNode } from '@/hooks/use-cluster-nodes';

function formatUptime(seconds: number | null): string {
  if (seconds == null) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function formatBandwidth(bytes: string | number | null): string {
  const n = Number(bytes ?? 0);
  if (isNaN(n) || n === 0) return '0 B/s';
  if (n < 1024) return `${n} B/s`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB/s`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

function getMetricColor(value: number | null): string {
  if (value == null) return 'bg-muted';
  if (value < 70) return 'bg-chart-1';
  if (value < 90) return 'bg-chart-4';
  return 'bg-chart-5';
}

function StatusBadge({ status }: { status: SrsNode['status'] }) {
  const config: Record<SrsNode['status'], { className: string; label: string }> = {
    ONLINE: { className: 'bg-chart-1 text-white', label: 'Online' },
    OFFLINE: { className: 'bg-chart-5 text-white', label: 'Offline' },
    DEGRADED: { className: 'bg-chart-4 text-white', label: 'Degraded' },
    CONNECTING: { className: 'bg-blue-500 text-white', label: 'Connecting' },
  };
  const c = config[status] ?? config.OFFLINE;
  return <Badge className={c.className}>{c.label}</Badge>;
}

function MetricRow({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  const pct = value ?? 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value != null ? `${Math.round(pct)}${suffix ?? '%'}` : '--'}
        </span>
      </div>
      <div className="relative h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${getMetricColor(value)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

interface NodeDetailDialogProps {
  node: SrsNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NodeDetailDialog({ node, open, onOpenChange }: NodeDetailDialogProps) {
  if (!node) return null;

  async function handleReloadConfig() {
    try {
      await apiFetch(`/api/cluster/nodes/${node!.id}/reload`, {
        method: 'POST',
      });
      toast.success(`Configuration reloaded on ${node!.name}`);
    } catch {
      toast.error(`Failed to reload configuration on ${node!.name}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{node.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info Section */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Role</span>
              <div className="mt-1">
                {node.role === 'ORIGIN' ? (
                  <Badge variant="outline">Origin</Badge>
                ) : (
                  <Badge variant="secondary">Edge</Badge>
                )}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <div className="mt-1">
                <StatusBadge status={node.status} />
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">URL</span>
              <div className="mt-1 truncate font-mono text-xs">{node.hlsUrl}</div>
            </div>
            <div>
              <span className="text-muted-foreground">SRS Version</span>
              <div className="mt-1">{node.srsVersion ?? '--'}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Uptime</span>
              <div className="mt-1">{formatUptime(node.uptime)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Active Viewers</span>
              <div className="mt-1 font-semibold tabular-nums">{node.viewers}</div>
            </div>
          </div>

          <Separator />

          {/* Health Metrics */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Health Metrics</h3>
            <MetricRow label="CPU" value={node.cpu} />
            <MetricRow label="Memory" value={node.memory} />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Bandwidth</span>
                <span className="font-medium">{formatBandwidth(node.bandwidth)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Config Status */}
          <div>
            <h3 className="text-sm font-medium mb-2">Config Status</h3>
            <p className="text-sm text-muted-foreground">
              {node.missedChecks === 0
                ? 'Configuration is up to date'
                : "Configuration is outdated. Click 'Reload Config' to apply changes."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Close
          </DialogClose>
          <Button variant="secondary" onClick={handleReloadConfig}>
            Reload Config
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
