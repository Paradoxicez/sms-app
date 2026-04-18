'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapPin } from 'lucide-react';

import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useFeatureCheck } from '@/hooks/use-feature-check';
import { useCameraStatus } from '@/hooks/use-camera-status';
import { CameraMap, type MapCamera } from '@/components/map/camera-map';
import { MapTreeOverlay } from '@/components/map/map-tree-overlay';
import {
  usePlacementMode,
  PlacementBanner,
  PlacementMarker,
} from '@/components/map/placement-mode';
import { useHierarchyData } from '@/components/hierarchy/use-hierarchy-data';
import type { TreeNode } from '@/components/hierarchy/use-hierarchy-data';
import { ViewStreamSheet } from '@/app/admin/cameras/components/view-stream-sheet';
import type { CameraRow } from '@/app/admin/cameras/components/cameras-columns';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

/** Collect all camera IDs from a tree node and its descendants */
function collectCameraIds(node: TreeNode): string[] {
  if (node.type === 'camera') return [node.id];
  const ids: string[] = [];
  if (node.children) {
    for (const child of node.children) {
      ids.push(...collectCameraIds(child));
    }
  }
  return ids;
}

export default function TenantMapPage() {
  const { enabled: mapEnabled, loading: featureLoading } = useFeatureCheck('map');
  const [cameras, setCameras] = useState<MapCamera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | undefined>(undefined);

  // Tree overlay state
  const [filterNode, setFilterNode] = useState<TreeNode | null>(null);
  const hierarchyData = useHierarchyData();

  // View Stream sheet state
  const [viewStreamCamera, setViewStreamCamera] = useState<CameraRow | null>(null);
  const [viewStreamOpen, setViewStreamOpen] = useState(false);

  // Drag-to-relocate state
  const [dragPending, setDragPending] = useState<{
    id: string; name: string; lat: number; lng: number;
  } | null>(null);
  const [dragSaving, setDragSaving] = useState(false);

  const handleDragEnd = useCallback(
    (id: string, name: string, lat: number, lng: number) => {
      setDragPending({ id, name, lat, lng });
      setCameras((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, latitude: lat, longitude: lng } : c,
        ),
      );
    },
    [],
  );

  const confirmDrag = useCallback(async () => {
    if (!dragPending) return;
    setDragSaving(true);
    try {
      await apiFetch(`/api/cameras/${dragPending.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          location: { lat: dragPending.lat, lng: dragPending.lng },
        }),
      });
      toast.success('Location updated');
      setDragPending(null);
      fetchCameras();
      hierarchyData.refresh();
    } catch {
      toast.error('Failed to update location');
    } finally {
      setDragSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragPending]);

  const cancelDrag = useCallback(() => {
    setDragPending(null);
    fetchCameras();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Placement mode
  const placement = usePlacementMode(() => {
    // On successful placement, refresh cameras and hierarchy
    fetchCameras();
    hierarchyData.refresh();
  });

  // Compute filtered camera IDs from selected tree node
  const filteredCameraIds = useMemo<string[] | null>(() => {
    if (!filterNode) return null;
    return collectCameraIds(filterNode);
  }, [filterNode]);

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

  // Handle View Stream from map popup
  const handleViewStream = useCallback(
    (cameraId: string) => {
      const cam = cameras.find((c) => c.id === cameraId);
      if (!cam) return;

      // Map MapCamera to CameraRow shape for ViewStreamSheet
      const cameraRow: CameraRow = {
        id: cam.id,
        name: cam.name,
        status: cam.status as CameraRow['status'],
        isRecording: false,
        streamUrl: '',
        createdAt: '',
      };
      setViewStreamCamera(cameraRow);
      setViewStreamOpen(true);
    },
    [cameras],
  );

  // Handle Set Location — when placement mode clicks map, route to drag confirm bar
  const handleSetLocation = useCallback(
    (cameraId: string, cameraName: string) => {
      placement.startPlacing(cameraId, cameraName);
    },
    [placement],
  );

  // Bridge placement confirming → drag confirm bar
  useEffect(() => {
    if (placement.state.mode === 'confirming') {
      const { cameraId, cameraName, lat, lng } = placement.state;
      setDragPending({ id: cameraId, name: cameraName, lat, lng });
      placement.cancel();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement.state.mode]);

  // Feature loading state
  if (featureLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[calc(100vh-10rem)] min-h-[320px] w-full rounded-lg md:h-[calc(100vh-8rem)]" />
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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Map View</h1>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-[calc(100vh-10rem)] min-h-[320px] w-full rounded-lg md:h-[calc(100vh-8rem)]" />
      ) : cameras.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-16 text-center">
          <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No cameras on map</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Set camera locations from the tree panel or camera settings.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              // Trigger the tree overlay panel to open by setting a dummy node then clearing
              // The overlay has its own internal open state, so we use a ref approach
              // For simplicity, we just inform users
            }}
          >
            Open tree panel
          </Button>
        </div>
      ) : (
        <div className="relative">
          {/* Placement instruction banner */}
          <PlacementBanner state={placement.state} onCancel={placement.cancel} />

          {/* Map */}
          {/* Drag confirm bar */}
          {dragPending && (
            <div
              role="alert"
              className="absolute top-0 left-0 right-0 z-[2000] flex items-center justify-center gap-3 bg-primary text-primary-foreground py-2 px-4 text-sm"
            >
              <span>Move &apos;{dragPending.name}&apos; to ({dragPending.lat.toFixed(4)}, {dragPending.lng.toFixed(4)})?</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={confirmDrag}
                disabled={dragSaving}
                className="h-7 text-xs"
              >
                {dragSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelDrag}
                className="h-7 text-xs text-primary-foreground hover:text-primary-foreground/80"
              >
                Cancel
              </Button>
            </div>
          )}

          <CameraMap
            cameras={cameras}
            filteredCameraIds={filteredCameraIds}
            placementActive={placement.state.mode !== 'idle'}
            onMapClick={placement.onMapClick}
            onViewStream={handleViewStream}
            onSetLocation={handleSetLocation}
            onDragEnd={handleDragEnd}
          >
            {/* Placement marker renders inside MapContainer */}
            <PlacementMarker
              state={placement.state}
              onConfirm={placement.confirm}
              onCancel={placement.cancel}
              isSubmitting={placement.isSubmitting}
            />
          </CameraMap>

          {/* Tree overlay */}
          <MapTreeOverlay
            tree={hierarchyData.tree}
            isLoading={hierarchyData.isLoading}
            selectedId={filterNode?.id ?? null}
            onSelect={setFilterNode}
            onSetLocation={handleSetLocation}
          />
        </div>
      )}

      {/* View Stream Sheet */}
      <ViewStreamSheet
        camera={viewStreamCamera}
        open={viewStreamOpen}
        onOpenChange={setViewStreamOpen}
      />
    </div>
  );
}
