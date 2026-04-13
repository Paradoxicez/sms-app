import { describe, it } from 'vitest';

describe('RecordingsService - Segment Archival (REC-01)', () => {
  it.todo('archives segment to MinIO when recording is active');
  it.todo('skips archive when recording is not active for camera');
  it.todo('skips archive when orgId/cameraId cannot be parsed from stream key');
  it.todo('detects and archives fMP4 init segment on first callback');
  it.todo('validates file path against allowed mount prefix to prevent path traversal');
  it.todo('updates recording totalSize and totalDuration after segment upload');
});
