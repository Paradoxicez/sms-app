'use client';

import { useEffect, useState, useCallback } from 'react';
import { Camera, Eye, Wifi, MonitorOff } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useDashboardStats, useCameraStatusList } from '@/hooks/use-dashboard-stats';
import { useCameraStatus } from '@/hooks/use-camera-status';
import { StatCard } from '@/components/dashboard/stat-card';
import { SystemMetrics } from '@/components/dashboard/system-metrics';
import { BandwidthChart } from '@/components/dashboard/bandwidth-chart';
import { ApiUsageChart } from '@/components/dashboard/api-usage-chart';
import { CameraStatusTable } from '@/components/dashboard/camera-status-table';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardCamera } from '@/hooks/use-dashboard-stats';

function formatBandwidth(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

export default function DashboardPage() {
  const { stats, loading: statsLoading } = useDashboardStats();
  const { cameras, setCameras, loading: camerasLoading } = useCameraStatusList();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);

  useEffect(() => {
    async function loadSession() {
      try {
        const session = await authClient.getSession();
        setUserRole(session.data?.user?.role ?? null);
        setOrgId(
          session.data?.session?.activeOrganizationId ?? undefined,
        );
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

  const isSuperAdmin = userRole === 'admin';

  // Empty state
  if (!statsLoading && stats && stats.totalCameras === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Camera className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">No cameras registered</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Register your first camera to start monitoring. Once cameras are
            active, stats and charts will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Stat cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[108px] w-full rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            label="Total Viewers"
            value={stats.totalViewers}
            icon={<Eye className="h-4 w-4" />}
          />
          <StatCard
            label="Bandwidth"
            value={formatBandwidth(stats.bandwidth)}
            icon={<Wifi className="h-4 w-4" />}
          />
        </div>
      ) : null}

      {/* System metrics — super admin only */}
      {isSuperAdmin && <SystemMetrics />}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BandwidthChart />
        <ApiUsageChart />
      </div>

      {/* Camera status table */}
      <CameraStatusTable cameras={cameras} loading={camerasLoading} />
    </div>
  );
}
