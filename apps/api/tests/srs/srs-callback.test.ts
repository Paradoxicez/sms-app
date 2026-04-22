import { describe, it } from 'vitest';

describe('SrsCallbackController on-publish — Phase 19 (D-02)', () => {
  // All entries are it.todo stubs — Wave 1-2 tasks convert them to real tests.
  it.todo('enqueues probe job with source: "srs-api" after statusService.transition(online)');
  it.todo('uses jobId probe:{cameraId} for dedup');
  it.todo('uses delay=1000ms so SRS registry populates before probe fetch');
  it.todo('does not enqueue when cameraId is missing from parseStreamKey');
  it.todo('does not throw if probeQueue is undefined (test-harness guard)');
});
