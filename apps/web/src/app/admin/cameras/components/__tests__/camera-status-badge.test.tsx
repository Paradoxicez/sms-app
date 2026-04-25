import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { CameraStatusPill, StatusPills } from '../camera-status-badge';
import type { CameraRow } from '../cameras-columns';

type PillCamera = Pick<CameraRow, 'status' | 'isRecording' | 'maintenanceMode'>;

function makeCamera(overrides: Partial<PillCamera> = {}): PillCamera {
  return {
    status: 'online',
    isRecording: false,
    maintenanceMode: false,
    ...overrides,
  };
}

describe('StatusPills (Phase 20)', () => {
  describe('single state rendering (D-13)', () => {
    it('renders LIVE pill with red-500/95 bg + pulse when status=online and not recording and not maintenance', () => {
      render(<StatusPills camera={makeCamera({ status: 'online' })} />);
      const live = screen.getByLabelText('Live');
      expect(live).toBeInTheDocument();
      expect(live.className).toContain('bg-red-500/95');
      expect(live.className).toContain('motion-safe:animate-pulse');
      // Only the LIVE pill — no REC, no MAINT, no OFFLINE.
      expect(screen.queryByLabelText('Recording')).toBeNull();
      expect(screen.queryByLabelText(/In maintenance/)).toBeNull();
      expect(screen.queryByLabelText('Offline')).toBeNull();
    });

    it('renders REC pill with zinc-900 bg + red pulsing dot when isRecording=true', () => {
      const { container } = render(
        <StatusPills camera={makeCamera({ status: 'offline', isRecording: true })} />
      );
      const rec = screen.getByLabelText('Recording');
      expect(rec).toBeInTheDocument();
      expect(rec.className).toContain('bg-zinc-900');
      // Red dot inside REC pill.
      const redDot = container.querySelector('.bg-red-500.motion-safe\\:animate-pulse');
      expect(redDot).not.toBeNull();
      // No LIVE (offline), no MAINT, no OFFLINE (recording fills the must-have-one requirement).
      expect(screen.queryByLabelText('Live')).toBeNull();
      expect(screen.queryByLabelText('Offline')).toBeNull();
    });

    it('renders MAINT pill with amber bg + wrench icon when maintenanceMode=true', () => {
      render(<StatusPills camera={makeCamera({ status: 'offline', maintenanceMode: true })} />);
      const maint = screen.getByLabelText('In maintenance — notifications suppressed');
      expect(maint).toBeInTheDocument();
      expect(maint.className).toContain('bg-amber-100');
      expect(maint.className).toContain('text-amber-800');
      // MAINT alone covers must-have-one — no OFFLINE.
      expect(screen.queryByLabelText('Offline')).toBeNull();
    });

    it('renders OFFLINE pill with muted bg + hollow dot when status=offline and not recording and not maintenance', () => {
      const { container } = render(
        <StatusPills camera={makeCamera({ status: 'offline' })} />
      );
      const offline = screen.getByLabelText('Offline');
      expect(offline).toBeInTheDocument();
      expect(offline.className).toContain('bg-muted');
      // Hollow dot = bg-transparent with muted-foreground border.
      const hollowDot = container.querySelector('.border-muted-foreground');
      expect(hollowDot).not.toBeNull();
    });

    it('renders reconnecting variant (amber outline + [animation-duration:1s]) when status=reconnecting', () => {
      render(<StatusPills camera={makeCamera({ status: 'reconnecting' })} />);
      const reconnecting = screen.getByLabelText('Reconnecting');
      expect(reconnecting).toBeInTheDocument();
      expect(reconnecting.className).toContain('border-amber-500');
      expect(reconnecting.className).toContain('[animation-duration:1s]');
      expect(reconnecting.className).toContain('motion-safe:animate-pulse');
    });

    it('renders reconnecting variant when status=connecting', () => {
      render(<StatusPills camera={makeCamera({ status: 'connecting' })} />);
      const reconnecting = screen.getByLabelText('Reconnecting');
      expect(reconnecting).toBeInTheDocument();
      expect(reconnecting.className).toContain('border-amber-500');
      expect(reconnecting.className).toContain('[animation-duration:1s]');
    });
  });

  describe('multi-pill ordering (D-14)', () => {
    it('renders LIVE then REC when status=online + isRecording=true', () => {
      render(
        <StatusPills camera={makeCamera({ status: 'online', isRecording: true })} />
      );
      const live = screen.getByLabelText('Live');
      const rec = screen.getByLabelText('Recording');
      expect(live).toBeInTheDocument();
      expect(rec).toBeInTheDocument();
      // DOM order: LIVE precedes REC.
      // compareDocumentPosition returns 4 (DOCUMENT_POSITION_FOLLOWING) when `rec` follows `live`.
      expect(live.compareDocumentPosition(rec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('does NOT render LIVE when maintenanceMode=true (maintenance suppresses LIVE)', () => {
      render(
        <StatusPills camera={makeCamera({ status: 'online', maintenanceMode: true })} />
      );
      expect(screen.queryByLabelText('Live')).toBeNull();
      expect(screen.queryByLabelText('Reconnecting')).toBeNull();
      expect(screen.getByLabelText('In maintenance — notifications suppressed')).toBeInTheDocument();
    });

    it('renders REC then MAINT when isRecording=true + maintenanceMode=true + status=offline', () => {
      render(
        <StatusPills
          camera={makeCamera({ status: 'offline', isRecording: true, maintenanceMode: true })}
        />
      );
      const rec = screen.getByLabelText('Recording');
      const maint = screen.getByLabelText('In maintenance — notifications suppressed');
      expect(rec.compareDocumentPosition(maint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('accessibility (D-15)', () => {
    it('LIVE pill has aria-label="Live"', () => {
      render(<StatusPills camera={makeCamera({ status: 'online' })} />);
      expect(screen.getByLabelText('Live')).toBeInTheDocument();
    });

    it('REC pill has aria-label="Recording"', () => {
      render(<StatusPills camera={makeCamera({ status: 'offline', isRecording: true })} />);
      expect(screen.getByLabelText('Recording')).toBeInTheDocument();
    });

    it('MAINT pill has aria-label="In maintenance — notifications suppressed"', () => {
      render(<StatusPills camera={makeCamera({ status: 'offline', maintenanceMode: true })} />);
      expect(screen.getByLabelText('In maintenance — notifications suppressed')).toBeInTheDocument();
    });

    it('OFFLINE pill has aria-label="Offline"', () => {
      render(<StatusPills camera={makeCamera({ status: 'offline' })} />);
      expect(screen.getByLabelText('Offline')).toBeInTheDocument();
    });

    it('wrapping container has role="group" aria-label="Camera status"', () => {
      render(<StatusPills camera={makeCamera()} />);
      const group = screen.getByRole('group', { name: /camera status/i });
      expect(group).toBeInTheDocument();
    });

    it('pill icons are aria-hidden="true"', () => {
      const { container } = render(
        <StatusPills camera={makeCamera({ status: 'online', isRecording: true })} />
      );
      // With LIVE + REC, we expect 2 pills, each has an icon or decorative dot marked aria-hidden.
      const hidden = container.querySelectorAll('[aria-hidden="true"]');
      // LIVE Radio icon + REC red-dot span = 2 hidden elements.
      expect(hidden.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('token reuse from camera-popup.tsx:201-214 (Planner constraint)', () => {
    it('LIVE pill classes include "bg-red-500/95"', () => {
      render(<StatusPills camera={makeCamera({ status: 'online' })} />);
      const live = screen.getByLabelText('Live');
      expect(live.className).toContain('bg-red-500/95');
    });

    it('LIVE pill classes include "text-white"', () => {
      render(<StatusPills camera={makeCamera({ status: 'online' })} />);
      const live = screen.getByLabelText('Live');
      expect(live.className).toContain('text-white');
    });

    it('LIVE pill classes include "text-[10px] font-bold uppercase tracking-wide"', () => {
      render(<StatusPills camera={makeCamera({ status: 'online' })} />);
      const live = screen.getByLabelText('Live');
      expect(live.className).toContain('text-[10px]');
      expect(live.className).toContain('font-bold');
      expect(live.className).toContain('uppercase');
      expect(live.className).toContain('tracking-wide');
    });

    it('LIVE pill classes include "motion-safe:animate-pulse"', () => {
      render(<StatusPills camera={makeCamera({ status: 'online' })} />);
      const live = screen.getByLabelText('Live');
      expect(live.className).toContain('motion-safe:animate-pulse');
    });

    it('LIVE pill classes include "motion-reduce:animate-none"', () => {
      render(<StatusPills camera={makeCamera({ status: 'online' })} />);
      const live = screen.getByLabelText('Live');
      expect(live.className).toContain('motion-reduce:animate-none');
    });

    it('REC pill red dot classes include "bg-red-500"', () => {
      const { container } = render(
        <StatusPills camera={makeCamera({ status: 'offline', isRecording: true })} />
      );
      const redDot = container.querySelector('.bg-red-500');
      expect(redDot).not.toBeNull();
    });

    it('REC pill red dot classes include "motion-safe:animate-pulse"', () => {
      const { container } = render(
        <StatusPills camera={makeCamera({ status: 'offline', isRecording: true })} />
      );
      const redDot = container.querySelector('.bg-red-500.motion-safe\\:animate-pulse');
      expect(redDot).not.toBeNull();
    });
  });
});

// ───────────────────────── Quick 260425-vrl ─────────────────────────
// CameraStatusPill — status-only variant of StatusPills consumed by the
// camera card-view overlay. Reads from the SAME module-scope className
// constants as StatusPills so a future visual tweak updates both views
// in one edit (table ↔ card share a single source of truth).
describe('CameraStatusPill (card-view variant)', () => {
  it('renders red LIVE pill with Radio icon when status=online', () => {
    const { container } = render(<CameraStatusPill status="online" />);
    const live = screen.getByLabelText('Live');
    expect(live).toBeInTheDocument();
    expect(live.textContent).toContain('LIVE');
    expect(live.className).toContain('bg-red-500/95');
    expect(live.className).toContain('text-white');
    expect(live.className).toContain('motion-safe:animate-pulse');
    // Radio icon (lucide renders an svg).
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('renders amber LIVE pill with Radio icon when status=reconnecting', () => {
    const { container } = render(<CameraStatusPill status="reconnecting" />);
    const live = screen.getByLabelText('Live');
    expect(live).toBeInTheDocument();
    expect(live.textContent).toContain('LIVE');
    expect(live.className).toContain('border-amber-500');
    expect(live.className).toContain('bg-transparent');
    expect(live.className).toContain('text-amber-700');
    expect(live.className).toContain('motion-safe:animate-pulse');
    expect(live.className).toContain('[animation-duration:1s]');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('renders amber LIVE pill (same as reconnecting) when status=connecting', () => {
    const { container } = render(<CameraStatusPill status="connecting" />);
    const live = screen.getByLabelText('Live');
    expect(live).toBeInTheDocument();
    expect(live.textContent).toContain('LIVE');
    expect(live.className).toContain('border-amber-500');
    expect(live.className).toContain('bg-transparent');
    expect(live.className).toContain('text-amber-700');
    expect(live.className).toContain('motion-safe:animate-pulse');
    expect(live.className).toContain('[animation-duration:1s]');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('renders gray OFFLINE pill with hollow circle when status=offline', () => {
    const { container } = render(<CameraStatusPill status="offline" />);
    const offline = screen.getByLabelText('Offline');
    expect(offline).toBeInTheDocument();
    expect(offline.textContent).toContain('OFFLINE');
    expect(offline.className).toContain('border-border');
    expect(offline.className).toContain('bg-muted');
    expect(offline.className).toContain('text-muted-foreground');
    // Hollow dot = bg-transparent with muted-foreground border.
    const hollowDot = container.querySelector(
      '.size-2.rounded-full.border-muted-foreground.bg-transparent'
    );
    expect(hollowDot).not.toBeNull();
  });

  it('renders gray OFFLINE pill (same as offline) when status=degraded', () => {
    const { container } = render(<CameraStatusPill status="degraded" />);
    const offline = screen.getByLabelText('Offline');
    expect(offline).toBeInTheDocument();
    expect(offline.textContent).toContain('OFFLINE');
    expect(offline.className).toContain('border-border');
    expect(offline.className).toContain('bg-muted');
    expect(offline.className).toContain('text-muted-foreground');
    const hollowDot = container.querySelector(
      '.size-2.rounded-full.border-muted-foreground.bg-transparent'
    );
    expect(hollowDot).not.toBeNull();
  });

  it('table StatusPills LIVE and card CameraStatusPill LIVE share the same className (single source of truth)', () => {
    const { unmount } = render(
      <StatusPills camera={{ status: 'online', isRecording: false, maintenanceMode: false }} />
    );
    const tableLive = screen.getByLabelText('Live');
    const tableLiveClass = tableLive.className;
    unmount();

    render(<CameraStatusPill status="online" />);
    const cardLive = screen.getByLabelText('Live');
    expect(cardLive.className).toBe(tableLiveClass);
  });
});
