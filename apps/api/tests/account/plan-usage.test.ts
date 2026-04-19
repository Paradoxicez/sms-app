// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-01 Task T6.
import { describe, it } from 'vitest';

describe('GET /api/organizations/:orgId/plan-usage', () => {
  it.todo('returns { package, usage, features } for a member');
  it.todo('package shape: id, name, description, maxCameras, maxViewers, maxBandwidthMbps, maxStorageGb, features');
  it.todo('usage.cameras is COUNT cameras for orgId (snapshot)');
  it.todo('usage.viewers sums StatusService.getViewerCount across org cameras');
  it.todo('usage.storageUsedBytes is SUM(RecordingSegment.size) serialized as decimal string');
  it.todo('usage.apiCallsMtd equals persisted ApiKeyUsage.requests MTD plus today Redis delta');
  it.todo('usage.bandwidthAvgMbpsMtd equals bytes*8 / secondsElapsedInMonth / 1e6');
  it.todo('returns package: null when Organization.packageId is null');
  it.todo('returns 403 when caller is not a Member of :orgId');
  it.todo('returns 401 when unauthenticated');
});
