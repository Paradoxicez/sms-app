'use client';

import dynamic from 'next/dynamic';

const CameraMapInner = dynamic(() => import('./camera-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center rounded-lg border bg-muted">
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
}

interface CameraMapProps {
  cameras: MapCamera[];
}

export function CameraMap({ cameras }: CameraMapProps) {
  return <CameraMapInner cameras={cameras} />;
}
