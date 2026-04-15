'use client';

import { useEffect, useState, useCallback } from 'react';
import { MapPin } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useFeatureCheck } from '@/hooks/use-feature-check';
import { useCameraStatus } from '@/hooks/use-camera-status';
import { CameraMap, type MapCamera } from '@/components/map/camera-map';
import { Skeleton } from '@/components/ui/skeleton';

export default function TenantMapPage() {
  const { enabled: mapEnabled, loading: featureLoading } = useFeatureCheck('map');
  const [cameras, setCameras] = useState<MapCamera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const fetchCameras = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Array<Record<string, unknown>>>('/api/cameras');
      const mapped: MapCamera[] = (Array.isArray(data) ? data : []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        status: c.status as string,
        latitude: (c.location as { lat?: number } | null)?.lat ?? null,
        longitude: (c.location as { lng?: number } | null)?.lng ?? null,
        viewerCount: (c.viewerCount as number) ?? 0,
      }));
      setCameras(mapped);
    } catch {
      setError('Could not load cameras. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mapEnabled) {
      fetchCameras();
    }
  }, [mapEnabled, fetchCameras]);

  // Real-time status updates via Socket.IO
  useCameraStatus(
    orgId,
    (event) => {
      setCameras((prev) =>
        prev.map((c) =>
          c.id === event.cameraId ? { ...c, status: event.status } : c,
        ),
      );
    },
    (event) => {
      setCameras((prev) =>
        prev.map((c) =>
          c.id === event.cameraId ? { ...c, viewerCount: event.count } : c,
        ),
      );
    },
  );

  // Feature loading state
  if (featureLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  // Feature disabled empty state
  if (!mapEnabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Map View</h1>
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-16 text-center">
          <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Map view not available</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            The map feature is not included in your current plan. Contact your
            administrator to upgrade.
          </p>
        </div>
      </div>
    );
  }

  // Check if any cameras have location data
  const camerasWithLocation = cameras.filter(
    (c) => c.latitude !== null && c.longitude !== null,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Map View</h1>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-[400px] w-full rounded-lg" />
      ) : camerasWithLocation.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-16 text-center">
          <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No camera locations available</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Add latitude and longitude to your cameras to see them on the map.
          </p>
        </div>
      ) : (
        <CameraMap cameras={cameras} />
      )}
    </div>
  );
}
