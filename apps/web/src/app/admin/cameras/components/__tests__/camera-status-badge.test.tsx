import { describe, it } from 'vitest';

describe('StatusPills (Phase 20)', () => {
  describe('single state rendering (D-13)', () => {
    it.todo('renders LIVE pill with red-500/95 bg + pulse when status=online and not recording and not maintenance');
    it.todo('renders REC pill with zinc-900 bg + red pulsing dot when isRecording=true');
    it.todo('renders MAINT pill with amber bg + wrench icon when maintenanceMode=true');
    it.todo('renders OFFLINE pill with muted bg + hollow dot when status=offline and not recording and not maintenance');
    it.todo('renders reconnecting variant (amber outline + [animation-duration:1s]) when status=reconnecting');
    it.todo('renders reconnecting variant when status=connecting');
  });

  describe('multi-pill ordering (D-14)', () => {
    it.todo('renders LIVE then REC when status=online + isRecording=true');
    it.todo('does NOT render LIVE when maintenanceMode=true (maintenance suppresses LIVE)');
    it.todo('renders REC then MAINT when isRecording=true + maintenanceMode=true + status=offline');
  });

  describe('accessibility (D-15)', () => {
    it.todo('LIVE pill has aria-label="Live"');
    it.todo('REC pill has aria-label="Recording"');
    it.todo('MAINT pill has aria-label="In maintenance — notifications suppressed"');
    it.todo('OFFLINE pill has aria-label="Offline"');
    it.todo('wrapping container has role="group" aria-label="Camera status"');
    it.todo('pill icons are aria-hidden="true"');
  });

  describe('token reuse from camera-popup.tsx:201-214 (Planner constraint)', () => {
    it.todo('LIVE pill classes include "bg-red-500/95"');
    it.todo('LIVE pill classes include "text-white"');
    it.todo('LIVE pill classes include "text-[10px] font-bold uppercase tracking-wide"');
    it.todo('LIVE pill classes include "motion-safe:animate-pulse"');
    it.todo('LIVE pill classes include "motion-reduce:animate-none"');
    it.todo('REC pill red dot classes include "bg-red-500"');
    it.todo('REC pill red dot classes include "motion-safe:animate-pulse"');
  });
});
