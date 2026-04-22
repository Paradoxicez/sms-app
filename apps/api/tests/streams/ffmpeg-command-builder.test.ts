import { describe, it } from 'vitest';

describe('buildFfmpegCommand protocol branching — Phase 19 (D-13)', () => {
  // All entries are it.todo stubs — Wave 1-2 tasks convert them to real tests.
  it.todo('rtsp:// URL emits -rtsp_transport tcp in args');
  it.todo('rtmp:// URL does NOT emit -rtsp_transport');
  it.todo('rtmps:// URL does NOT emit -rtsp_transport');
  it.todo('srt:// URL does NOT emit -rtsp_transport');
});
