import { describe, it } from 'vitest';

describe('CodecStatusCell — Phase 19 (D-05, D-06, D-07)', () => {
  // All entries are it.todo stubs — Wave 1-2 tasks convert them to real tests.
  it.todo('renders Loader2 spinner with aria-label "Probing codec…" when status is "pending"');
  it.todo('renders AlertTriangle amber + inline RotateCw retry button when status is "failed"');
  it.todo('renders "H.264" text (codec only) when status is "success" with video.codec');
  it.todo('renders em-dash "—" when codecInfo is null');
  it.todo('renders em-dash "—" for legacy shape { codec, width, height } (handled via normalizeCodecInfo)');
  it.todo('renders em-dash "—" for legacy shape { error } (treated as failed after normalize)');
  it.todo('retry button click fires onRetry(cameraId) with correct id');
  it.todo('retry button swaps RotateCw → Loader2 during in-flight request (isRetrying prop)');
  it.todo('tooltip shows "Probe failed: {reason}" when status failed and error set');
  it.todo('tooltip falls back to "Probe failed" when error is missing');
  it.todo('respects motion-safe: spinner uses motion-safe:animate-spin class');
});
