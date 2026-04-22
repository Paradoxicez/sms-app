import { describe, it } from 'vitest';

describe('CameraFormDialog Stream URL live validation — Phase 19 (D-15)', () => {
  // All entries are it.todo stubs — Wave 1-2 tasks convert them to real tests.
  it.todo('typing "http://x" shows inline error "URL must start with rtsp://, rtmps://, rtmp://, or srt://"');
  it.todo('typing "rtmp://host/s" clears error and shows helper "Supported: rtsp://, rtmps://, rtmp://, srt://"');
  it.todo('typing "rtmps://host/s" passes validation');
  it.todo('typing "srt://host" passes validation');
  it.todo('empty URL shows helper text, not error (HTML required handles empty)');
  it.todo('pasting URL with leading whitespace still passes (trim before regex)');
  it.todo('URL without hostname (e.g. "rtsp:///") shows "Invalid URL — check host and path"');
  it.todo('Save button disabled while streamUrlError is truthy');
  it.todo('Save button enabled when name + streamUrl valid + (edit mode or siteId)');
  it.todo('server 409 DUPLICATE_STREAM_URL shows "A camera with this stream URL already exists."');
  it.todo('server non-duplicate error shows generic "Failed to create camera…"');
  it.todo('aria-invalid + aria-describedby wired to error element id cam-url-error when error present');
});
