/**
 * Phase 18 — CameraPopup tests (post-UAT refactor per user feedback 2026-04-21):
 *  - English-only maintenance dialog (Thai copy removed)
 *  - Single primary CTA (View Recordings button removed)
 *  - ⋮ dropdown has Set Location + Enter/Exit Maintenance only (Open Camera Detail removed)
 *  - Status + metadata consolidated into inline header row + single metadata line
 *
 * Regression guard preserved: PreviewVideo does not remount when viewerCount changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CameraPopup } from './camera-popup';
import { recordingMapCamera, maintenanceMapCamera, makeMapCamera } from '@/test-utils/camera-fixtures';

vi.mock('hls.js', () => ({
  default: { isSupported: () => false },
}));

void recordingMapCamera;
void maintenanceMapCamera;
void makeMapCamera;

describe('CameraPopup (Phase 18 — map thumbnail popup redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UI-06: preview container has 16:9 aspect ratio and fills popup width (D-17)', () => {
    render(<CameraPopup id="c1" name="Lobby" status="online" />);
    const preview = screen.getByTestId('preview-container');
    expect(preview.className).toMatch(/aspect-\[16\/9\]/);
    expect(preview.className).toMatch(/w-full/);
  });

  it('UI-06: preview shows LIVE pill when online and not in maintenance', () => {
    render(<CameraPopup id="c1" name="Lobby" status="online" />);
    expect(screen.getByTestId('live-overlay')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('UI-06: REC pulse shows on preview when isRecording + online', () => {
    const { rerender } = render(
      <CameraPopup id="c1" name="Lobby" status="online" isRecording={true} />,
    );
    expect(screen.getByTestId('rec-overlay')).toBeInTheDocument();
    rerender(<CameraPopup id="c1" name="Lobby" status="offline" isRecording={true} />);
    expect(screen.queryByTestId('rec-overlay')).toBeNull();
  });

  it('UI-06: Maintenance pill replaces LIVE pill when maintenanceMode=true', () => {
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        maintenanceMode={true}
      />,
    );
    expect(screen.getByTestId('maint-overlay')).toBeInTheDocument();
    // Maintenance takes precedence over LIVE in the corner slot
    expect(screen.queryByTestId('live-overlay')).toBeNull();
  });

  it('UI-06: status dot encodes status via color + tooltip (no inline label)', () => {
    const { rerender } = render(<CameraPopup id="c1" name="Lobby" status="online" />);
    const dotOnline = screen.getByTestId('status-dot');
    expect(dotOnline.className).toContain('bg-green-500');
    expect(dotOnline.getAttribute('title')).toMatch(/Online/);

    rerender(<CameraPopup id="c1" name="Lobby" status="offline" />);
    const dotOffline = screen.getByTestId('status-dot');
    expect(dotOffline.className).toContain('bg-red-500');
    expect(dotOffline.getAttribute('title')).toMatch(/Offline/);
  });

  it('UI-06: maintenance sets dot amber + tooltip prefixed with Maintenance', () => {
    render(
      <CameraPopup id="c1" name="Lobby" status="online" maintenanceMode={true} />,
    );
    const dot = screen.getByTestId('status-dot');
    expect(dot.className).toContain('bg-amber-500');
    expect(dot.getAttribute('title')).toMatch(/^Maintenance/);
  });

  it('UI-06: subtitle includes retention when recording + online', () => {
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        isRecording={true}
        retentionDays={7}
      />,
    );
    expect(screen.getByTestId('subtitle')).toHaveTextContent(/7d retention/);
  });

  it('UI-06: subtitle shows by-user + relative time when in maintenance', () => {
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
    const sub = screen.getByTestId('subtitle');
    expect(sub).toHaveTextContent(/by Jane Doe/);
    expect(sub).toHaveTextContent(/ago/);
  });

  it('UI-06: subtitle shows "last seen {time} ago" only when offline', () => {
    const lastOnlineAt = new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString();
    const { rerender } = render(
      <CameraPopup id="c1" name="Lobby" status="offline" lastOnlineAt={lastOnlineAt} />,
    );
    expect(screen.getByTestId('subtitle')).toHaveTextContent(/last seen .* ago/);
    rerender(
      <CameraPopup id="c1" name="Lobby" status="online" lastOnlineAt={lastOnlineAt} />,
    );
    expect(screen.queryByText(/last seen/)).toBeNull();
  });

  it('UI-06: CTA is a text link labeled "details"', () => {
    render(<CameraPopup id="c1" name="Lobby" status="online" />);
    const cta = screen.getByRole('button', { name: /View details for Lobby/i });
    expect(cta).toBeInTheDocument();
    expect(cta.textContent).toMatch(/details/);
    expect(screen.queryByRole('button', { name: /View recordings/i })).toBeNull();
  });

  it('UI-06: CTA is disabled when offline', () => {
    render(<CameraPopup id="c1" name="Lobby" status="offline" />);
    const btn = screen.getByRole('button', { name: /View details for Lobby/i });
    expect(btn).toBeDisabled();
  });

  it('UI-06: CTA is disabled when in maintenance', () => {
    render(
      <CameraPopup id="c1" name="Lobby" status="online" maintenanceMode={true} />,
    );
    const btn = screen.getByRole('button', { name: /View details for Lobby/i });
    expect(btn).toBeDisabled();
  });

  it('UI-06: ⋮ dropdown has Set Location + Enter/Exit Maintenance ONLY (Open Camera Detail removed per UAT)', async () => {
    const user = userEvent.setup();
    render(<CameraPopup id="c1" name="Lobby" status="online" />);
    await user.click(screen.getByRole('button', { name: /More actions for Lobby/i }));
    expect(await screen.findByText('Set Location')).toBeInTheDocument();
    expect(screen.getByText(/Enter Maintenance|Exit Maintenance/)).toBeInTheDocument();
    expect(screen.queryByText(/Open Camera Detail/)).toBeNull();
  });

  it('UI-06: dropdown label switches to "Exit Maintenance" when already in maintenance', async () => {
    const user = userEvent.setup();
    render(
      <CameraPopup id="c1" name="Lobby" status="online" maintenanceMode={true} />,
    );
    await user.click(screen.getByRole('button', { name: /More actions for Lobby/i }));
    expect(await screen.findByText('Exit Maintenance')).toBeInTheDocument();
  });

  it('UI-06: Toggle Maintenance opens English-only confirmation dialog (Thai removed per UAT)', async () => {
    const user = userEvent.setup();
    render(<CameraPopup id="c1" name="Lobby" status="online" maintenanceMode={false} />);
    await user.click(screen.getByRole('button', { name: /More actions for Lobby/i }));
    await user.click(await screen.findByText('Enter Maintenance'));
    await waitFor(() => {
      expect(screen.getByText('Enter maintenance mode')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    // Guard: Thai copy must NOT be present
    expect(screen.queryByText(/เข้าสู่โหมดซ่อมบำรุง/)).toBeNull();
    expect(screen.queryByText(/ยกเลิก/)).toBeNull();
    expect(screen.queryByText(/ยืนยัน/)).toBeNull();
  });

  it('UI-06: Confirm in dialog calls onToggleMaintenance with (id, nextState)', async () => {
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
    await user.click(await screen.findByText('Enter Maintenance'));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(onToggle).toHaveBeenCalledWith('c1', true);
  });

  it('UI-06 REGRESSION GUARD: PreviewVideo does not remount when viewerCount changes (Phase 13 bug)', () => {
    const { rerender } = render(
      <CameraPopup id="c1" name="Lobby" status="online" viewerCount={1} />,
    );
    const video1 = document.querySelector('video');
    expect(video1).not.toBeNull();
    rerender(<CameraPopup id="c1" name="Lobby" status="online" viewerCount={2} />);
    const video2 = document.querySelector('video');
    expect(video2).toBe(video1);
    rerender(<CameraPopup id="c1" name="Lobby" status="online" viewerCount={3} />);
    const video3 = document.querySelector('video');
    expect(video3).toBe(video1);
  });

  it('UI-06: preview has w-full + aspect-[16/9] so it fills whatever popup width leaflet grants', () => {
    const { container } = render(<CameraPopup id="c1" name="Lobby" status="online" />);
    const preview = container.querySelector('[data-testid="preview-container"]') as HTMLElement;
    expect(preview).not.toBeNull();
    expect(preview.className).toMatch(/w-full/);
    expect(preview.className).toMatch(/aspect-\[16\/9\]/);
  });
});

/**
 * Phase 22 Plan 10 — Tags row + description block on the map popup.
 *
 * Spec references:
 *   - 22-UI-SPEC.md §"Map popup tag row" (line 61) — placement: after subtitle, before preview-container
 *   - 22-UI-SPEC.md §"Map popup description block" (line 367) — line-clamp-2 + Show more disclosure
 *   - 22-VALIDATION.md row 22-W2-MAP-POPUP — D-19 — popup tags row + description
 */
describe('Phase 22: tags + description', () => {
  it('renders tag badges when camera.tags is non-empty', () => {
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        tags={['Outdoor', 'Perimeter']}
      />,
    );
    expect(screen.getByText('Outdoor')).toBeInTheDocument();
    expect(screen.getByText('Perimeter')).toBeInTheDocument();
  });

  it('hides tags row when camera.tags is empty', () => {
    const { container } = render(
      <CameraPopup id="c1" name="Lobby" status="online" tags={[]} />,
    );
    // No tag-row container should be rendered when tags empty.
    expect(container.querySelector('[data-testid="popup-tags-row"]')).toBeNull();
  });

  it('renders description block when description is non-empty', () => {
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        description="Front door cam"
      />,
    );
    expect(screen.getByText('Front door cam')).toBeInTheDocument();
  });

  it('hides description block when description is null or empty', () => {
    const { container, rerender } = render(
      <CameraPopup id="c1" name="Lobby" status="online" description={null} />,
    );
    expect(
      container.querySelector('[data-testid="popup-description"]'),
    ).toBeNull();
    rerender(
      <CameraPopup id="c1" name="Lobby" status="online" description="" />,
    );
    expect(
      container.querySelector('[data-testid="popup-description"]'),
    ).toBeNull();
  });

  it('description paragraph has line-clamp-2 in the initial collapsed state', () => {
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        description="A reasonably long description that may wrap across multiple lines in the popup body when rendered inside the leaflet popup container that has limited width."
      />,
    );
    const desc = screen.getByTestId('popup-description-text');
    expect(desc.className).toMatch(/line-clamp-2/);
  });

  it('shows "Show more" disclosure on long description and toggles to "Show less" after click', async () => {
    const user = userEvent.setup();
    const long =
      'This description is intentionally long enough — well past the 100-character heuristic — so the disclosure must render and toggle the line-clamp state appropriately when the user interacts with it.';
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        description={long}
      />,
    );
    const more = screen.getByRole('button', { name: 'Show more' });
    expect(more).toBeInTheDocument();
    await user.click(more);
    // After expansion, line-clamp-2 must NOT be present and link reads Show less
    const desc = screen.getByTestId('popup-description-text');
    expect(desc.className).not.toMatch(/line-clamp-2/);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('clicking "Show less" collapses back to line-clamp-2 + restores "Show more"', async () => {
    const user = userEvent.setup();
    const long =
      'This description is intentionally long enough — well past the 100-character heuristic — so the disclosure must render and toggle the line-clamp state appropriately when the user interacts with it.';
    render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        description={long}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await user.click(screen.getByRole('button', { name: 'Show less' }));
    const desc = screen.getByTestId('popup-description-text');
    expect(desc.className).toMatch(/line-clamp-2/);
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('positions tags row after subtitle and before details button (DOM order)', () => {
    const { container } = render(
      <CameraPopup
        id="c1"
        name="Lobby"
        status="online"
        viewerCount={2}
        tags={['Lobby']}
        description="Hello"
      />,
    );
    const subtitle = screen.getByTestId('subtitle');
    const tagsRow = screen.getByTestId('popup-tags-row');
    const detailsBtn = screen.getByRole('button', { name: /View details for Lobby/i });
    // DOM order: subtitle precedes tagsRow, tagsRow precedes detailsBtn
    expect(
      subtitle.compareDocumentPosition(tagsRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      tagsRow.compareDocumentPosition(detailsBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    void container;
  });
});
