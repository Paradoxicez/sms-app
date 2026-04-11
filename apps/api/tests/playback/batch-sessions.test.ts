import { describe, it, expect } from 'vitest';

describe('Batch Playback Sessions', () => {
  it.todo('POST /api/playback/sessions/batch creates sessions for multiple cameras');
  it.todo('rejects batch larger than 50 camera IDs');
  it.todo('returns partial results when some cameras fail');
  it.todo('validates camera IDs are UUIDs');
  it.todo('requires authentication (session or API key)');
  it.todo('respects org isolation -- cannot create sessions for cameras in other orgs');
});
