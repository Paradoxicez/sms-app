'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { CameraPopup } from './camera-popup';
import { escapeHtml } from '@/lib/escape-html';

interface CameraMarkerProps {
  id: string;
  name: string;
  status: string;
  latitude: number;
  longitude: number;
  viewerCount?: number;
  // Phase 18 data fields (D-14 badges + D-18/D-19 popup fields consumed by Plan 04)
  isRecording: boolean;
  maintenanceMode: boolean;
  maintenanceEnteredBy: string | null;
  maintenanceEnteredAt: string | null;
  lastOnlineAt: string | null;
  retentionDays: number | null;
  onViewStream?: (id: string) => void;
  onSetLocation?: (id: string, name: string) => void;
  onDragEnd?: (id: string, name: string, lat: number, lng: number) => void;
  onToggleMaintenance?: (id: string, nextState: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e',      // green-500
  offline: '#ef4444',     // red-500
  degraded: '#f59e0b',    // amber-500
  connecting: '#3b82f6',  // blue-500
  reconnecting: '#f59e0b', // amber-500
};

export interface BuildMarkerIconArgs {
  status: string;
  isRecording: boolean;
  maintenanceMode: boolean;
  name: string;
}

/**
 * Build the `L.divIcon` for a camera pin. Exported so the pure icon-HTML
 * generation can be unit-tested without rendering the full react-leaflet
 * tree in jsdom (see camera-marker.test.tsx).
 *
 * Spec: D-13 teardrop SVG 28×36, D-14 recording dot + maintenance wrench
 * badges, D-15 reconnecting pulse preserved via className. XSS mitigation
 * (T-18-XSS-MARKER): camera name is HTML-escaped before interpolation into
 * the SVG aria-label.
 */
export function buildMarkerIcon({
  status,
  isRecording,
  maintenanceMode,
  name,
}: BuildMarkerIconArgs): L.DivIcon {
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
  const escapedName = escapeHtml(name);
  // Amber backgrounds need a dark outline on the white camera icon to keep
  // contrast ≥ 3:1 per UI-SPEC accessibility line 500.
  const isAmber = status === 'degraded' || status === 'reconnecting';
  const iconOutline = isAmber
    ? ' stroke="rgba(0,0,0,0.4)" stroke-width="1"'
    : '';

  // Teardrop path: M14 0 ... bottom tip at (14, 36).
  const teardrop = `<path d="M14 0 C6.3 0 0 6.3 0 14 c0 8.4 14 22 14 22 s14-13.6 14-22 C28 6.3 21.7 0 14 0 Z" fill="${color}" stroke="#fff" stroke-width="2"/>`;

  // Lucide Camera icon (rounded-rect body + lens circle), rendered white
  // and centered inside the 28×36 teardrop. Translate/scale calibrated so
  // the 24×24 Lucide viewport maps roughly to the rounded bulb area.
  const cameraIcon = `<g transform="translate(7 7) scale(0.583)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${iconOutline}>` +
    `<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>` +
    `<circle cx="12" cy="13" r="4"/>` +
    `</g>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" role="img" aria-label="Camera ${escapedName} — status ${escapeHtml(status)}">` +
    teardrop +
    cameraIcon +
    `</svg>`;

  const recordingDot = isRecording
    ? `<div aria-hidden="true" class="camera-pin__rec-dot motion-safe:animate-pulse" style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:#ef4444;"></div>`
    : '';

  const maintenanceBadge = maintenanceMode
    ? `<div aria-hidden="true" class="camera-pin__maint" style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:#6b7280;display:flex;align-items:center;justify-content:center;">` +
      `<svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>` +
      `</svg>` +
      `</div>`
    : '';

  const html =
    `<div style="position:relative;width:28px;height:36px">` +
    svg +
    recordingDot +
    maintenanceBadge +
    `</div>`;

  const className =
    'camera-marker-icon' +
    (status === 'reconnecting' ? ' camera-marker-icon--reconnecting' : '');

  return L.divIcon({
    className,
    html,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34],
  });
}

export function CameraMarker({
  id,
  name,
  status,
  latitude,
  longitude,
  viewerCount,
  isRecording,
  maintenanceMode,
  maintenanceEnteredBy,
  maintenanceEnteredAt,
  lastOnlineAt,
  retentionDays,
  onViewStream,
  onSetLocation,
  onDragEnd,
  onToggleMaintenance,
}: CameraMarkerProps) {
  const markerRef = useRef<L.Marker>(null);
  // Tracks Leaflet popup-open state so the inner <PreviewVideo> only mounts
  // (and the HLS player only loads, sending an SRS `on_play`) when the user
  // actually clicks the pin. Closed pins consume zero viewer slots.
  const [popupOpen, setPopupOpen] = useState(false);
  const icon = useMemo(
    () => buildMarkerIcon({ status, isRecording, maintenanceMode, name }),
    [status, isRecording, maintenanceMode, name],
  );

  // Stabilize the position tuple reference across re-renders. react-leaflet's
  // updateMarker uses strict reference equality (props.position !== prevProps.position)
  // to decide whether to call marker.setLatLng(). Inside a MarkerClusterGroup,
  // setLatLng triggers _moveChild's remove+re-add cycle which re-absorbs the
  // just-clicked leaf back into its cluster bubble. Memoizing on [latitude, longitude]
  // ensures the array reference only changes when coordinates actually change.
  const position = useMemo<[number, number]>(
    () => [latitude, longitude],
    [latitude, longitude],
  );

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

  const handleToggleMaintenance = useCallback(
    (cameraId: string, nextState: boolean) => {
      closePopup();
      onToggleMaintenance?.(cameraId, nextState);
    },
    [closePopup, onToggleMaintenance],
  );

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker && onDragEnd) {
          const pos = marker.getLatLng();
          onDragEnd(id, name, pos.lat, pos.lng);
        }
      },
      popupopen() {
        setPopupOpen(true);
      },
      popupclose() {
        setPopupOpen(false);
      },
    }),
    [id, name, onDragEnd],
  );

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      // Forward the status into Leaflet marker options so the cluster
      // iconCreateFunction can read worst-child status (D-16).
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error — forwarded to L.Marker options for cluster iconCreateFunction
      cameraStatus={status}
      draggable={!!onDragEnd}
      eventHandlers={eventHandlers}
    >
      <Popup maxWidth={260} minWidth={244}>
        <CameraPopup
          id={id}
          name={name}
          status={status}
          viewerCount={viewerCount}
          isRecording={isRecording}
          maintenanceMode={maintenanceMode}
          maintenanceEnteredBy={maintenanceEnteredBy}
          maintenanceEnteredAt={maintenanceEnteredAt}
          lastOnlineAt={lastOnlineAt}
          retentionDays={retentionDays}
          previewActive={popupOpen}
          onViewStream={handleViewStream}
          onSetLocation={handleSetLocation}
          onToggleMaintenance={handleToggleMaintenance}
        />
      </Popup>
    </Marker>
  );
}
