import { describe, it, expect } from 'vitest';

describe('Phase 21 — D-05 FfmpegService.gracefulRestart helper', () => {
  it.todo('gracefulRestart returns immediately when isRunning(cameraId) is false (no-op)');
  it.todo('gracefulRestart calls stopStream(cameraId) which sets intentionalStops and SIGTERM-kills the process');
  it.todo('gracefulRestart polls isRunning every 100ms; resolves when isRunning returns false BEFORE graceMs elapses');
  it.todo('gracefulRestart calls forceKill(cameraId) when isRunning still returns true after graceMs (default 5000)');
  it.todo('default graceMs is 5000 (5 seconds) — restart-flow value, not the 10s shutdown grace');
  it.todo('forceKill is NOT called when SIGTERM succeeds within graceMs');
});
