'use client';

import { Cpu, HardDrive, MemoryStick, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSystemMetrics } from '@/hooks/use-dashboard-stats';
import { StatCard } from './stat-card';

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
}

export function SystemMetrics() {
  const { metrics, loading, error } = useSystemMetrics();

  if (error) return null;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[108px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="CPU Usage"
        value={`${metrics.cpuPercent.toFixed(1)}%`}
        icon={<Cpu className="h-4 w-4" />}
        badge={
          metrics.cpuPercent > 80
            ? { text: 'High', variant: 'destructive' }
            : undefined
        }
      />
      <StatCard
        label="Memory Usage"
        value={`${metrics.memPercent.toFixed(1)}%`}
        icon={<MemoryStick className="h-4 w-4" />}
        badge={
          metrics.memPercent > 80
            ? { text: 'High', variant: 'destructive' }
            : undefined
        }
      />
      <StatCard
        label="System Load (1m)"
        value={metrics.load1m.toFixed(2)}
        icon={<HardDrive className="h-4 w-4" />}
      />
      <StatCard
        label="SRS Uptime"
        value={formatUptime(metrics.srsUptime)}
        icon={<Clock className="h-4 w-4" />}
      />
    </div>
  );
}
