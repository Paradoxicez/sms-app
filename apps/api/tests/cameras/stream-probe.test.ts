import { describe, it } from 'vitest';

describe('StreamProbeProcessor — Phase 19 (D-01, D-02, D-04, D-07)', () => {
  // All entries are it.todo stubs — Wave 1-2 tasks convert them to real tests.
  it.todo('rejects job with empty cameraId and logs error (MEMORY.md defensive guard)');
  it.todo('rejects job with empty streamUrl and logs error');
  it.todo('writes codecInfo.status = "pending" at job start');
  it.todo('writes codecInfo.status = "success" with video/audio on ffprobe success');
  it.todo('writes codecInfo.status = "failed" with normalized error on ffprobe failure');
  it.todo('source=srs-api branch calls SrsApiService.getStream and writes source: "srs-api"');
  it.todo('normalizeError maps "Connection refused" / ECONNREFUSED to "Connection refused"');
  it.todo('normalizeError maps 401/authorization to "Auth failed — check credentials"');
  it.todo('normalizeError maps "timed out" / ETIMEDOUT to "Timeout — camera not responding"');
  it.todo('normalizeError maps unable-to-resolve-host to "Hostname not resolvable"');
  it.todo('normalizeError truncates unmatched stderr at 80 chars');
  it.todo('jobId probe:{cameraId} deduplicates rapid double-enqueue (BullMQ native)');
});
