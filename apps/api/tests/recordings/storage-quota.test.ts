import { describe, it } from 'vitest';

describe('RecordingsService - Storage Quota (REC-05)', () => {
  it.todo('blocks new recordings when storage usage reaches 100% of maxStorageGb');
  it.todo('sends notification alert at 80% storage threshold');
  it.todo('sends notification alert at 90% storage threshold');
  it.todo('allows recording when storage usage is below quota');
  it.todo('calculates storage usage from DB segment size aggregation');
});
