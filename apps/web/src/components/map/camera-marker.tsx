'use client';

import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { CameraPopup } from './camera-popup';

interface CameraMarkerProps {
  id: string;
  name: string;
  status: string;
  latitude: number;
  longitude: number;
  viewerCount?: number;
}

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',      // green-500
  offline: '#ef4444',     // red-500
  degraded: '#f59e0b',    // amber-500
  connecting: '#3b82f6',  // blue-500
  reconnecting: '#f59e0b', // amber-500
};

export function CameraMarker({
  id,
  name,
  status,
  latitude,
  longitude,
  viewerCount,
}: CameraMarkerProps) {
  const icon = useMemo(() => {
    const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
    const pulseClass = status === 'reconnecting' ? 'animation: pulse 2s infinite;' : '';

    return L.divIcon({
      className: 'camera-marker-icon',
      html: `<div style="
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: ${color};
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        ${pulseClass}
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -10],
    });
  }, [status]);

  return (
    <Marker position={[latitude, longitude]} icon={icon}>
      <Popup maxWidth={240} minWidth={200}>
        <CameraPopup
          id={id}
          name={name}
          status={status}
          viewerCount={viewerCount}
        />
      </Popup>
    </Marker>
  );
}
