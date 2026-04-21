'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
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

/**
 * Structural shape of a Leaflet MarkerCluster the iconCreateFunction receives.
 * Using a narrow interface (instead of importing L.MarkerCluster) keeps the
 * helper pure and unit-testable without the full Leaflet runtime.
 */
export interface ClusterLike {
  getAllChildMarkers(): Array<{ options: { cameraStatus?: string } }>;
  getChildCount(): number;
}

const OFFLINE_STATUSES = new Set(['offline']);
const AMBER_STATUSES = new Set(['degraded', 'reconnecting']);

/**
 * Compute the worst child status among a cluster's markers (D-16).
 * Priority: offline > degraded/reconnecting > online/connecting.
 * Exported for direct unit testing + cluster icon generation.
 */
function computeWorstStatus(statuses: Array<string | undefined>): 'offline' | 'degraded' | 'online' {
  let worst: 'offline' | 'degraded' | 'online' = 'online';
  for (const s of statuses) {
    if (!s) continue;
    if (OFFLINE_STATUSES.has(s)) return 'offline';
    if (AMBER_STATUSES.has(s)) worst = 'degraded';
  }
  return worst;
}

const CLUSTER_FILL: Record<'offline' | 'degraded' | 'online', string> = {
  offline: '#ef4444',
  degraded: '#f59e0b',
  online: '#22c55e',
};

/**
 * Build an L.DivIcon for a cluster bubble colored by worst child status.
 * Pure function of child-marker options so it unit-tests without a live map.
 *
 * Spec: UI-SPEC §Cluster Bubble Colors — 90% opacity fill, 3px white ring
 * at 70% opacity, white semibold count text centered.
 *
 * XSS note (T-18-XSS-CLUSTER-BUBBLE): worst status and count are
 * enum/number values derived from server-known states — never user input —
 * so no escaping is needed inside the aria-label.
 */
export function createClusterIcon(cluster: ClusterLike): L.DivIcon {
  const statuses = cluster.getAllChildMarkers().map((m) => m.options.cameraStatus);
  const worst = computeWorstStatus(statuses);
  const fill = CLUSTER_FILL[worst];
  const count = cluster.getChildCount();

  const html =
    `<div role="img" aria-label="${count} cameras in this area, worst status ${worst}" ` +
    `style="width:36px;height:36px;border-radius:50%;` +
    `background:${fill}e6;` +
    `border:3px solid rgba(255,255,255,0.7);` +
    `display:flex;align-items:center;justify-content:center;` +
    `color:#fff;font-size:12px;font-weight:600;line-height:1;` +
    `box-shadow:0 1px 3px rgba(0,0,0,0.3);">` +
    `<span>${count}</span>` +
    `</div>`;

  return L.divIcon({
    html,
    className: 'camera-cluster-icon',
    iconSize: [36, 36],
  });
}

interface CameraMapInnerProps {
  cameras: MapCamera[];
  filteredCameraIds?: string[] | null;
  placementActive?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  onViewStream?: (id: string) => void;
  onSetLocation?: (id: string, name: string) => void;
  onDragEnd?: (id: string, name: string, lat: number, lng: number) => void;
  onViewRecordings?: (id: string) => void;
  onToggleMaintenance?: (id: string, nextState: boolean) => void;
  onOpenDetail?: (id: string) => void;
  children?: ReactNode;
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

    // Single camera: use setView instead of fitBounds for better zoom
    if (cameras.length === 1) {
      map.setView([cameras[0].latitude, cameras[0].longitude], 16);
      return;
    }

    const bounds = L.latLngBounds(
      cameras.map((c) => [c.latitude, c.longitude] as [number, number]),
    );

    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [map, cameras]);

  return null;
}

/** Handle map click events during placement mode */
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function CameraMapInner({
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
}: CameraMapInnerProps) {
  // Filter to cameras that have valid lat/lng, then apply filteredCameraIds
  const mappableCameras = useMemo(
    () =>
      cameras.filter(
        (c): c is MapCamera & { latitude: number; longitude: number } => {
          if (c.latitude === null || c.longitude === null) return false;
          if (filteredCameraIds != null && !filteredCameraIds.includes(c.id)) return false;
          return true;
        },
      ),
    [cameras, filteredCameraIds],
  );

  const center: [number, number] =
    mappableCameras.length > 0
      ? [mappableCameras[0].latitude, mappableCameras[0].longitude]
      : DEFAULT_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      className={`h-[calc(100vh-10rem)] min-h-[320px] w-full rounded-lg md:h-[calc(100vh-8rem)] ${
        placementActive ? 'cursor-crosshair' : ''
      }`}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <ResizeHandler />
      <FitBounds cameras={mappableCameras} />

      {placementActive && onMapClick && (
        <MapClickHandler onMapClick={onMapClick} />
      )}

      <MarkerClusterGroup chunkedLoading iconCreateFunction={createClusterIcon}>
        {mappableCameras.map((camera) => (
          <CameraMarker
            key={camera.id}
            id={camera.id}
            name={camera.name}
            status={camera.status}
            latitude={camera.latitude}
            longitude={camera.longitude}
            viewerCount={camera.viewerCount}
            isRecording={camera.isRecording ?? false}
            maintenanceMode={camera.maintenanceMode ?? false}
            maintenanceEnteredBy={camera.maintenanceEnteredBy ?? null}
            maintenanceEnteredAt={camera.maintenanceEnteredAt ?? null}
            lastOnlineAt={camera.lastOnlineAt ?? null}
            retentionDays={camera.retentionDays ?? null}
            onViewStream={onViewStream}
            onSetLocation={onSetLocation}
            onDragEnd={onDragEnd}
            onViewRecordings={onViewRecordings}
            onToggleMaintenance={onToggleMaintenance}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </MarkerClusterGroup>

      {children}
    </MapContainer>
  );
}
