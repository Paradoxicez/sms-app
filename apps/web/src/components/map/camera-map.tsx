'use client';

import dynamic from 'next/dynamic';

const CameraMapInner = dynamic(() => import('./camera-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-10rem)] min-h-[320px] items-center justify-center rounded-lg border bg-muted md:h-[calc(100vh-8rem)]">
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  ),
});

export interface MapCamera {
  id: string;
  name: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  viewerCount?: number;
  // Phase 18 — consumed by Plan 03 marker badges (D-14) + Plan 04 popup (D-18..D-22).
  isRecording?: boolean;
  maintenanceMode?: boolean;
  maintenanceEnteredBy?: string | null;
  maintenanceEnteredAt?: string | null;
  lastOnlineAt?: string | null;
  retentionDays?: number | null;
}

interface CameraMapProps {
  cameras: MapCamera[];
  filteredCameraIds?: string[] | null;
  placementActive?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  onViewStream?: (id: string) => void;
  onSetLocation?: (id: string, name: string) => void;
  onDragEnd?: (id: string, name: string, lat: number, lng: number) => void;
  // Phase 18 popup callbacks forwarded to CameraMarker → CameraPopup (Plan 04).
  onViewRecordings?: (id: string) => void;
  onToggleMaintenance?: (id: string, nextState: boolean) => void;
  onOpenDetail?: (id: string) => void;
  children?: React.ReactNode;
}

export function CameraMap({
  cameras,
  filteredCameraIds,
  placementActive,
  onMapClick,
  onViewStream,
  onSetLocation,
  onDragEnd,
  onViewRecordings,
  onToggleMaintenance,
  onOpenDetail,
  children,
}: CameraMapProps) {
  return (
    <CameraMapInner
      cameras={cameras}
      filteredCameraIds={filteredCameraIds}
      placementActive={placementActive}
      onMapClick={onMapClick}
      onViewStream={onViewStream}
      onSetLocation={onSetLocation}
      onDragEnd={onDragEnd}
      onViewRecordings={onViewRecordings}
      onToggleMaintenance={onToggleMaintenance}
      onOpenDetail={onOpenDetail}
    >
      {children}
    </CameraMapInner>
  );
}
