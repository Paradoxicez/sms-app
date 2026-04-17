'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import { CameraMarker } from './camera-marker';
import type { MapCamera } from './camera-map';

// Fix Leaflet default icon issue in bundlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;

// Default center (Bangkok, Thailand) when no cameras have locations
const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];
const DEFAULT_ZOOM = 12;

interface CameraMapInnerProps {
  cameras: MapCamera[];
}

/** Resize Leaflet map when sidebar collapses/expands (D-15) */
function ResizeHandler() {
  const map = useMap();

  useEffect(() => {
    function handleResize() {
      map.invalidateSize();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [map]);

  return null;
}

/** Auto-fit map bounds to all camera markers */
function FitBounds({ cameras }: { cameras: Array<{ latitude: number; longitude: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (cameras.length === 0) return;

    const bounds = L.latLngBounds(
      cameras.map((c) => [c.latitude, c.longitude] as [number, number]),
    );

    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [map, cameras]);

  return null;
}

export default function CameraMapInner({ cameras }: CameraMapInnerProps) {
  // Filter to cameras that have valid lat/lng
  const mappableCameras = useMemo(
    () =>
      cameras.filter(
        (c): c is MapCamera & { latitude: number; longitude: number } =>
          c.latitude !== null && c.longitude !== null,
      ),
    [cameras],
  );

  const center: [number, number] =
    mappableCameras.length > 0
      ? [mappableCameras[0].latitude, mappableCameras[0].longitude]
      : DEFAULT_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      className="h-[calc(100vh-10rem)] min-h-[320px] w-full rounded-lg md:h-[calc(100vh-8rem)]"
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <ResizeHandler />
      <FitBounds cameras={mappableCameras} />

      <MarkerClusterGroup chunkedLoading>
        {mappableCameras.map((camera) => (
          <CameraMarker
            key={camera.id}
            id={camera.id}
            name={camera.name}
            status={camera.status}
            latitude={camera.latitude}
            longitude={camera.longitude}
            viewerCount={camera.viewerCount}
          />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
