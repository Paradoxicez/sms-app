'use client';

import { useCallback, useMemo, useRef } from 'react';
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
  onViewStream?: (id: string) => void;
  onSetLocation?: (id: string, name: string) => void;
  onDragEnd?: (id: string, name: string, lat: number, lng: number) => void;
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
  onViewStream,
  onSetLocation,
  onDragEnd,
}: CameraMarkerProps) {
  const markerRef = useRef<L.Marker>(null);
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

  const closePopup = useCallback(() => {
    markerRef.current?.closePopup();
  }, []);

  const handleViewStream = useCallback((cameraId: string) => {
    closePopup();
    onViewStream?.(cameraId);
  }, [closePopup, onViewStream]);

  const handleSetLocation = useCallback((cameraId: string, cameraName: string) => {
    closePopup();
    onSetLocation?.(cameraId, cameraName);
  }, [closePopup, onSetLocation]);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker && onDragEnd) {
          const pos = marker.getLatLng();
          onDragEnd(id, name, pos.lat, pos.lng);
        }
      },
    }),
    [id, name, onDragEnd],
  );

  return (
    <Marker
      ref={markerRef}
      position={[latitude, longitude]}
      icon={icon}
      draggable={!!onDragEnd}
      eventHandlers={eventHandlers}
    >
      <Popup maxWidth={240} minWidth={200}>
        <CameraPopup
          id={id}
          name={name}
          status={status}
          viewerCount={viewerCount}
          onViewStream={handleViewStream}
          onSetLocation={handleSetLocation}
        />
      </Popup>
    </Marker>
  );
}
