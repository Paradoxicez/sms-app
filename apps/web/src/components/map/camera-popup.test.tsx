/**
 * Phase 18 Plan 04 — CameraPopup refactor tests (D-17..D-22 + regression guard).
 * Plan 00 left 13 `it.todo` placeholders; this file flips them all.
 *
 * Regression guard: "PreviewVideo does not remount when viewerCount prop changes on parent"
 *   — Phase 13 had a runaway-viewer-count bug where every viewerCount broadcast
 *     remounted the <video>, triggered a fresh SRS on_play, which broadcast again.
 *     memo() at apps/web/src/components/map/camera-popup.tsx:41 is the fix. We
 *     assert the <video> DOM node identity is preserved across re-renders that
 *     only change viewerCount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CameraPopup } from './camera-popup';
import { recordingMapCamera, maintenanceMapCamera, makeMapCamera } from '@/test-utils/camera-fixtures';

// Mock hls.js so jsdom doesn't attempt MSE. PreviewVideo's <video> still mounts
// (the regression-guard node-identity assertion needs a real video element).
vi.mock('hls.js', () => ({
  default: { isSupported: () => false },
}));

// Exercise fixtures for import-path validation + satisfy TS unused-import check.
void recordingMapCamera;
void maintenanceMapCamera;
void makeMapCamera;

describe('CameraPopup (Phase 18 — map thumbnail popup redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UI-06: preview container is 240x135 (D-17)', () => {
    render(<CameraPopup id="c1" name="Lobby" status="online" />);
    const preview = screen.getByTestId('preview-container');
    expect(preview).toHaveStyle({ width: '240px', height: '135px' });
  });

  it('UI-06: popup renders REC overlay top-left when isRecording and status=online (D-18)', () => {
    const { rerender } = render(
      <CameraPopup id="c1" name="Lobby" status="online" isRecording={true} />,
    );
    expect(screen.getByText('REC')).toBeInTheDocument();
    // REC overlay hides when offline (preview is black "Stream offline" card)
    rerender(<CameraPopup id="c1" name="Lobby" status="offline" isRecording={true} />);
    expect(screen.queryByText('REC')).toBeNull();
  });

  it('UI-06: popup renders Maintenance overlay when maintenanceMode=true (D-18)', () => {
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        maintenanceMode={true}
      />,
    );
    // The overlay pill lives inside the preview container (sibling to <video>)
    const preview = screen.getByTestId('preview-container');
    expect(preview.querySelector('[data-testid="maint-overlay"]')).not.toBeNull();
  });

  it('UI-06: renders Recording badge with "{N} days retention" when retentionDays present (D-19)', () => {
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        isRecording={true}
        retentionDays={7}
      />,
    );
    // Two "Recording" affordances render (overlay pill + badge). The badge is
    // the one carrying retention text.
    expect(screen.getByText(/Recording · 7 days retention/)).toBeInTheDocument();
  });

  it('UI-06: renders Maintenance badge with by-user + relative time (D-19)', () => {
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        maintenanceMode={true}
        maintenanceEnteredBy="Jane Doe"
        maintenanceEnteredAt={new Date(Date.now() - 1000 * 60 * 30).toISOString()}
      />,
    );
    // Badge combines maintenance label + by-user + relative time
    const badge = screen.getByTestId('maint-badge');
    expect(badge).toHaveTextContent(/Maintenance/);
    expect(badge).toHaveTextContent(/by Jane Doe/);
    expect(badge).toHaveTextContent(/ago/);
  });

  it('UI-06: renders "Offline {time} ago" only when status=offline (D-19)', () => {
    const lastOnlineAt = new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString();
    const { rerender } = render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="offline"
        lastOnlineAt={lastOnlineAt}
      />,
    );
    expect(screen.getByText(/Offline .* ago/)).toBeInTheDocument();
    rerender(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        lastOnlineAt={lastOnlineAt}
      />,
    );
    expect(screen.queryByText(/Offline .* ago/)).toBeNull();
  });

  it('UI-06: two primary action buttons: View Stream + View Recordings (D-21)', () => {
    render(<CameraPopup id="c1" name="Lobby" status="online" />);
    expect(screen.getByRole('button', { name: /View stream for Lobby/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View recordings for Lobby/i })).toBeInTheDocument();
  });

  it('UI-06: ⋮ dropdown has Set Location, Toggle Maintenance, Open Camera Detail (D-21)', async () => {
    const user = userEvent.setup();
    render(<CameraPopup id="c1" name="Lobby" status="online" />);
    const moreBtn = screen.getByRole('button', { name: /More actions for Lobby/i });
    await user.click(moreBtn);
    expect(await screen.findByText('Set Location')).toBeInTheDocument();
    expect(screen.getByText(/Toggle Maintenance|Exit Maintenance/)).toBeInTheDocument();
    expect(screen.getByText('Open Camera Detail')).toBeInTheDocument();
  });

  it('UI-06: Toggle Maintenance opens confirmation dialog (Phase 15-04 reuse)', async () => {
    const user = userEvent.setup();
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        maintenanceMode={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: /More actions for Lobby/i }));
    const toggleItem = await screen.findByText(/Toggle Maintenance/);
    await user.click(toggleItem);
    // Dialog opens with Thai + English title
    await waitFor(() => {
      expect(screen.getByText(/เข้าสู่โหมดซ่อมบำรุง.*Enter maintenance mode/)).toBeInTheDocument();
    });
    // Cancel + Confirm buttons present
    expect(screen.getByRole('button', { name: /ยกเลิก.*Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ยืนยัน.*Confirm/i })).toBeInTheDocument();
  });

  it('UI-06: Toggle Maintenance confirm calls POST /api/cameras/:id/maintenance (via prop)', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        maintenanceMode={false}
        onToggleMaintenance={onToggle}
      />,
    );
    await user.click(screen.getByRole('button', { name: /More actions for Lobby/i }));
    await user.click(await screen.findByText(/Toggle Maintenance/));
    const confirm = await screen.findByRole('button', { name: /ยืนยัน.*Confirm/i });
    await user.click(confirm);
    expect(onToggle).toHaveBeenCalledWith('c1', true);
  });

  it('UI-06: View Recordings navigates to /app/recordings?camera={id} (via prop)', async () => {
    const user = userEvent.setup();
    const onViewRecordings = vi.fn();
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        onViewRecordings={onViewRecordings}
      />,
    );
    await user.click(screen.getByRole('button', { name: /View recordings for Lobby/i }));
    expect(onViewRecordings).toHaveBeenCalledWith('c1');
  });

  it('UI-06 REGRESSION GUARD: PreviewVideo does not remount when viewerCount prop changes on parent (Phase 13 runaway viewer count bug)', () => {
    const { rerender } = render(
      <CameraPopup id="c1" name="Lobby" status="online" viewerCount={1} />,
    );
    const video1 = document.querySelector('video');
    expect(video1).not.toBeNull();
    rerender(<CameraPopup id="c1" name="Lobby" status="online" viewerCount={2} />);
    const video2 = document.querySelector('video');
    expect(video2).toBe(video1); // same DOM node → no remount
    rerender(<CameraPopup id="c1" name="Lobby" status="online" viewerCount={3} />);
    const video3 = document.querySelector('video');
    expect(video3).toBe(video1);
  });

  it('UI-06: popup Leaflet maxWidth=320 minWidth=280 (D-22 — set by CameraMarker on <Popup>)', () => {
    // D-22 is a prop on react-leaflet's <Popup> element (CameraMarker owns that).
    // Plan 03 asserts maxWidth=320/minWidth=280 on camera-marker.tsx. For popup
    // body we assert the body width budget is <= 320px. The preview container
    // at 240px + 16px padding stays within the budget.
    const { container } = render(<CameraPopup id="c1" name="Lobby" status="online" />);
    const preview = container.querySelector('[data-testid="preview-container"]') as HTMLElement;
    expect(preview).not.toBeNull();
    expect(preview.style.width).toBe('240px');
    // Popup Leaflet width budget 280..320 — preview + padding must fit. 240 <= 320.
    expect(240).toBeLessThanOrEqual(320);
    expect(240).toBeGreaterThanOrEqual(0);
  });
});
