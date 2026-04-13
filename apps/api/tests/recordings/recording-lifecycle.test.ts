import { describe, it } from 'vitest';

describe('RecordingsService - Recording Lifecycle (REC-03)', () => {
  it.todo('starts recording: creates Recording record with status=recording');
  it.todo('starts recording: sets camera isRecording flag to true');
  it.todo('stops recording: sets Recording status to complete and stoppedAt timestamp');
  it.todo('stops recording: clears camera isRecording flag');
  it.todo('rejects start when camera is already recording');
  it.todo('rejects start when camera is offline');
  it.todo('rejects start when storage quota is exceeded');
});
