// Phase 19.1 Plan 03 — serializeCamera contract (D-07).
// Pure unit test; no mocks.
import { describe, it, expect } from 'vitest';
import { serializeCamera } from '../../src/cameras/serialize-camera.util';

describe('serializeCamera mask contract (D-07)', () => {
  // 21-char key — matches maskStreamKey's normal branch (length > 8).
  const pushCam = {
    id: 'c1',
    ingestMode: 'push',
    streamKey: 'abcdefghijklmnopqrstu',
    streamUrl: 'rtmp://host:1935/push/abcdefghijklmnopqrstu',
  };

  it('perspective=owner returns full streamUrl for push cameras', () => {
    expect(serializeCamera(pushCam, { perspective: 'owner' })).toEqual(
      pushCam,
    );
  });

  it('perspective=masked replaces streamKey and masks it in streamUrl', () => {
    const masked = serializeCamera(pushCam, { perspective: 'masked' });
    // maskStreamKey = first-4 + ellipsis + last-4
    expect(masked.streamKey).toBe('abcd…rstu');
    expect(masked.streamUrl).toBe('rtmp://host:1935/push/abcd…rstu');
  });

  it('pull camera unaffected by perspective', () => {
    const pullCam = {
      id: 'c2',
      ingestMode: 'pull',
      streamKey: null,
      streamUrl: 'rtsp://host/a',
    };
    expect(serializeCamera(pullCam, { perspective: 'masked' })).toEqual(
      pullCam,
    );
  });
});
