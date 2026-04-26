import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';

import { CameraCard } from '../camera-card';
import type { CameraRow } from '../cameras-columns';

/**
 * Phase 22 Plan 22-08 — Camera-card name description tooltip (D-17, D-18).
 *
 * Card-view counterpart to the cameras-columns name tooltip. Only mounts the
 * Tooltip when description.trim() is non-empty (D-17), uses `max-w-[320px]`
 * + `line-clamp-6` (D-18), and does not override `delayDuration` (Radix
 * default).
 */

function baseCamera(overrides: Partial<CameraRow> = {}): CameraRow {
  return {
    id: 'cam-card-a',
    name: 'Garage Cam',
    status: 'offline',
    isRecording: false,
    maintenanceMode: false,
    streamUrl: 'rtsp://x',
    codecInfo: null,
    streamProfileId: null,
    streamProfile: null,
    location: null,
    description: null,
    tags: [],
    site: { id: 's', name: 'S', project: { id: 'p', name: 'P' } },
    createdAt: new Date('2026-04-26T00:00:00Z').toISOString(),
    ...overrides,
  };
}

const noop = vi.fn();

function Harness({ camera }: { camera: CameraRow }) {
  const playersRef = useRef(0);
  return (
    <CameraCard
      camera={camera}
      onViewStream={noop}
      onEdit={noop}
      onDelete={noop}
      onRecordToggle={noop}
      onStreamToggle={noop}
      onEmbedCode={noop}
      activePlayersRef={playersRef}
      maxConcurrent={2}
    />
  );
}

describe('Phase 22: CameraCard name description tooltip', () => {
  it('hovering camera name shows tooltip with description text when description is set', async () => {
    render(
      <Harness camera={baseCamera({ name: 'Front Door', description: 'Inspection: angle covers porch.' })} />,
    );
    const nameSpan = screen.getByText('Front Door');
    fireEvent.focus(nameSpan);
    await new Promise((r) => setTimeout(r, 50));
    const matches = await screen.findAllByText(/Inspection: angle covers porch\./);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT mount a tooltip when description is null', () => {
    render(<Harness camera={baseCamera({ name: 'Bare', description: null })} />);
    const triggers = document.querySelectorAll('[data-slot="tooltip-trigger"]');
    expect(triggers.length).toBe(0);
    expect(screen.getByText('Bare')).toBeInTheDocument();
  });

  it('does NOT mount a tooltip when description is empty string', () => {
    render(<Harness camera={baseCamera({ name: 'Empty', description: '' })} />);
    const triggers = document.querySelectorAll('[data-slot="tooltip-trigger"]');
    expect(triggers.length).toBe(0);
  });

  it('source file uses max-w-[320px] (D-18)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'camera-card.tsx'),
      'utf8',
    );
    expect(src).toContain('max-w-[320px]');
  });

  it('source file uses line-clamp-6 (D-18)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'camera-card.tsx'),
      'utf8',
    );
    expect(src).toContain('line-clamp-6');
  });

  it('source file does NOT pass delayDuration prop (D-18 — Radix default delay)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'camera-card.tsx'),
      'utf8',
    );
    expect(src).not.toContain('delayDuration=');
  });
});
