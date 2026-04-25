import { describe, it, expect } from 'vitest';

describe('Phase 21 — D-07 audit row at enqueue time', () => {
  it.todo("Each affected camera gets exactly one audit row with action='camera.profile_hot_reload'");
  it.todo("Audit row resource='camera' and resourceId equals cameraId (not profileId)");
  it.todo('Audit row details contains profileId, oldFingerprint (sha256:...), newFingerprint (sha256:...), and triggeredBy');
  it.todo('triggeredBy is { userId, userEmail } when req.user is present');
  it.todo('triggeredBy is { system: true } when no user context (defensive — script callpath)');
  it.todo('Audit row is written at ENQUEUE time, before queue.add — so even if the job is later removed/superseded the audit persists');
  it.todo("method='PATCH' and path matches the originating /api/stream-profiles/:id or /api/cameras/:id request URL");
});
