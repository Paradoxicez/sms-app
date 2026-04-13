import { describe, it } from 'vitest';

describe('RetentionProcessor - Retention Cleanup (REC-04)', () => {
  it.todo('deletes segments older than camera-level retention period');
  it.todo('falls back to org default retention when camera has no override');
  it.todo('removes MinIO objects for expired segments');
  it.todo('removes DB records for expired segments');
  it.todo('updates recording totalSize after segment deletion');
  it.todo('deletes empty Recording records after all segments removed');
});
