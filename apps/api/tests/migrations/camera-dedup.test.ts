import { describe, it } from 'vitest';

describe('camera_stream_url_unique migration — Phase 19 (D-10c, D-11)', () => {
  // All entries are it.todo stubs — Wave 1-2 tasks convert them to real tests.
  it.todo('keep-oldest dedup: 7-row fixture collapses to 4 rows per expectedSurvivorIds');
  it.todo('keep-oldest dedup: deletes exactly expectedDedupDeletedCount (3) rows');
  it.todo('tenant isolation: orgA and orgB with same streamUrl both survive');
  it.todo('unique row (cam4-unique) preserved untouched');
  it.todo('creating new duplicate after migration fires P2002 with meta.target including streamUrl');
});
