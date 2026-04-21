'use client';

import { useEffect, useState, useCallback } from 'react';
import { Camera, Eye, Wifi, MonitorOff, Video, Wrench } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useDashboardStats, useCameraStatusList } from '@/hooks/use-dashboard-stats';
import { useCameraStatus } from '@/hooks/use-camera-status';
import { StatCard } from '@/components/dashboard/stat-card';
import { BandwidthChart } from '@/components/dashboard/bandwidth-chart';
import { ApiUsageChart } from '@/components/dashboard/api-usage-chart';
import { IssuesPanel } from '@/components/dashboard/issues-panel';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardCamera } from '@/hooks/use-dashboard-stats';

function formatBandwidth(bytes: number): string {
  if (bytes == null || typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0)
    return '0 B/s';
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

export default function TenantDashboardPage() {
  const { stats, loading: statsLoading } = useDashboardStats();
  // useCameraStatusList is retained because the Socket.IO subscription
  // (useCameraStatus below) pushes status/viewer updates through setCameras;
  // IssuesPanel internally re-reads this same hook so the panel stays live.
  const { setCameras } = useCameraStatusList();
  const [orgId, setOrgId] = useState<string | undefined>(undefined);

  useEffect(() => {
    async function loadSession() {
      try {
        const session = await authClient.getSession();
        setOrgId(session.data?.session?.activeOrganizationId ?? undefined);
      } catch {
        // Session check handled by layout
      }
    }
    loadSession();
  }, []);

  // Real-time camera status updates via Socket.IO
  const handleStatusChange = useCallback(
    (event: { cameraId: string; status: string }) => {
      setCameras((prev: DashboardCamera[]) =>
        prev.map((c) =>
          c.id === event.cameraId
            ? { ...c, status: event.status as DashboardCamera['status'] }
            : c,
        ),
      );
    },
    [setCameras],
  );

  const handleViewersChange = useCallback(
    (event: { cameraId: string; count: number }) => {
      setCameras((prev: DashboardCamera[]) =>
        prev.map((c) =>
          c.id === event.cameraId ? { ...c, viewerCount: event.count } : c,
        ),
      );
    },
    [setCameras],
  );

  useCameraStatus(orgId, handleStatusChange, handleViewersChange);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Stat cards — 6 cards per Phase 18 D-02 */}
      {statsLoading ? (
        <div
          data-testid="stat-cards-grid"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-[108px] w-full rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <div
          data-testid="stat-cards-grid"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        >
          <StatCard
            label="Cameras Online"
            value={stats.camerasOnline}
            icon={<Camera className="h-4 w-4" />}
            badge={
              stats.camerasOnline > 0
                ? { text: 'Live', variant: 'default' }
                : undefined
            }
          />
          <StatCard
            label="Cameras Offline"
            value={stats.camerasOffline}
            icon={<MonitorOff className="h-4 w-4" />}
            badge={
              stats.camerasOffline > 0
                ? { text: `${stats.camerasOffline} down`, variant: 'destructive' }
                : undefined
            }
          />
          <StatCard
            label="Recording"
            value={stats.camerasRecording}
            icon={<Video className="h-4 w-4" />}
            badge={
              stats.camerasRecording > 0
                ? { text: `${stats.camerasRecording} active`, variant: 'default' }
                : undefined
            }
          />
          <StatCard
            label="In Maintenance"
            value={stats.camerasInMaintenance}
            icon={<Wrench className="h-4 w-4" />}
          />
          <StatCard
            label="Total Viewers"
            value={stats.totalViewers}
            icon={<Eye className="h-4 w-4" />}
          />
          <StatCard
            label="Stream Bandwidth"
            value={formatBandwidth(stats.streamBandwidth * 125)}
            icon={<Wifi className="h-4 w-4" />}
          />
        </div>
      ) : null}

      {/* Charts — kept per D-03 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BandwidthChart />
        <ApiUsageChart />
      </div>

      {/* Issues panel — per D-04 (replaces the prior status table) */}
      <IssuesPanel />
    </div>
  );
}
